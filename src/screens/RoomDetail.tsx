"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  evaluateVideoTranscript,
  extractTranscriptFromVideo,
  evaluateClipWithScreenshot,
  averageClipScores,
  summarizeClipDescriptions,
  type EvaluationResult,
} from "@/lib/aiEvaluator";
import { hasApiKey } from "@/lib/apiKeyResolver";
import { extractClipsFromVideo } from "@/lib/videoProcessor";
import {
  appendToSheet,
  createSpreadsheet,
  downloadFileAsBlob,
  getSheetValues,
  listVideosInFolder,
  moveFileToFolder,
  getEvaluatedVideos,
} from "@/lib/googleApi";
import { useAppStore } from "@/stores/useAppStore";
import type { AIProvider, VideoFile, ClipEvaluationResult } from "@/types";

interface RoomDetailProps {
  roomId: string;
}

export default function RoomDetail({ roomId }: RoomDetailProps) {
  const router = useRouter();
  const rooms = useAppStore((state) => state.rooms);
  const auth = useAppStore((state) => state.auth);
  const roomVideos = useAppStore((state) => state.roomVideos);
  const setRoomVideos = useAppStore((state) => state.setRoomVideos);
  const updateVideo = useAppStore((state) => state.updateVideo);
  const updateRoom = useAppStore((state) => state.updateRoom);

  const room = useMemo(() => rooms.find((candidate) => candidate.id === roomId), [roomId, rooms]);
  const videos = useMemo(() => roomVideos[roomId] || [], [roomId, roomVideos]);

  const [loadingVideos, setLoadingVideos] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [log, setLog] = useState<string[]>([]);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(room?.aiProvider || "gemini");
  const [enteredApiKey, setEnteredApiKey] = useState("");

  const PROVIDERS: { value: AIProvider; label: string; placeholder: string }[] = [
    { value: "openai", label: "OpenAI", placeholder: "sk-..." },
    { value: "claude", label: "Claude (Anthropic)", placeholder: "sk-ant-..." },
    { value: "gemini", label: "Google Gemini", placeholder: "AIza..." },
    { value: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
    { value: "groq", label: "Groq", placeholder: "gsk_..." },
  ];

  const addLog = useCallback((message: string) => {
    setLog((previous) => [...previous, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  const loadVideos = useCallback(async () => {
    if (!room || !auth.accessToken) {
      return;
    }

    setLoadingVideos(true);

    try {
      const files = await listVideosInFolder(room.driveFolderId, auth.accessToken);

      // If the room has a spreadsheet, read evaluated videos from it
      const evaluatedMap = new Map<string, { clipsEvaluated: number; scores: Record<string, number>; descriptions: Record<string, string> }>();
      if (room.spreadsheetId) {
        try {
          const rubricNames = room.rubrics.map((r) => r.name);
          const evaluatedVideos = await getEvaluatedVideos(room.spreadsheetId, rubricNames, auth.accessToken);
          for (const ev of evaluatedVideos) {
            evaluatedMap.set(ev.name, { clipsEvaluated: ev.clipsEvaluated, scores: ev.scores, descriptions: ev.descriptions });
          }
          addLog(`Restored ${evaluatedVideos.length} evaluated video(s) from spreadsheet`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to read spreadsheet";
          addLog(`Warning: ${message}`);
        }
      }

      const mapped: VideoFile[] = files.map((file: VideoFile) => {
        const baseName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
        const evaluated = evaluatedMap.get(baseName);

        if (evaluated) {
          return {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            webViewLink: file.webViewLink,
            status: "completed" as const,
            scores: evaluated.scores,
            descriptions: evaluated.descriptions,
            clipEvaluationResults: [], // We don't store individual clip results in the sheet
            averagedScores: evaluated.scores,
            averagedDescriptions: evaluated.descriptions,
          };
        }

        return {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          webViewLink: file.webViewLink,
          status: "pending" as const,
        };
      });

      setRoomVideos(room.id, mapped);
      addLog(`Found ${mapped.length} video(s) in folder`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load videos";
      addLog(`Error loading videos: ${message}`);
    } finally {
      setLoadingVideos(false);
    }
  }, [addLog, auth.accessToken, room, setRoomVideos]);

  useEffect(() => {
    if (room && videos.length === 0) {
      void loadVideos();
    }
  }, [loadVideos, room, videos.length]);

  const processVideos = useCallback(async () => {
    if (!room || !auth.accessToken || processing) {
      return;
    }

    // Check if API key is available
    if (!hasApiKey(room.aiProvider, room.aiApiKey)) {
      setSelectedProvider(room.aiProvider);
      setEnteredApiKey("");
      setShowApiKeyPrompt(true);
      return;
    }

    startEvaluation();
  }, [addLog, auth.accessToken, processing, room, updateRoom, updateVideo, videos]);

  const handleApiKeySubmit = useCallback(() => {
    if (!enteredApiKey.trim()) {
      return;
    }
    updateRoom(room!.id, { aiProvider: selectedProvider, aiApiKey: enteredApiKey.trim() });
    setShowApiKeyPrompt(false);
    startEvaluation();
  }, [enteredApiKey, selectedProvider, room, updateRoom]);

  const startEvaluation = useCallback(async () => {
    if (!room || !auth.accessToken || processing) {
      return;
    }

    setProcessing(true);
    updateRoom(room.id, { status: "processing" });
    addLog("Starting clip-based evaluation...");

    const headers = ["Sr.", "Name", "Clips Evaluated", ...room.rubrics.map((rubric) => rubric.name), "TOTAL MARKS", "Description"];
    let spreadsheetId = room.spreadsheetId;

    try {
      if (!spreadsheetId) {
        addLog("Creating Google Sheet...");
        spreadsheetId = await createSpreadsheet(`${room.name} - Evaluations`, headers, auth.accessToken);
        await moveFileToFolder(spreadsheetId, room.driveFolderId, auth.accessToken);
        updateRoom(room.id, { spreadsheetId });
        addLog("Sheet created and moved to folder");
      }

      const pendingVideos = videos.filter((video) => video.status === "pending" || video.status === "error");

      // Get the current row count to determine the starting Sr. number
      let startingSrNumber = 1;
      if (spreadsheetId) {
        try {
          const existingRows = await getSheetValues(spreadsheetId, "Evaluations!A:A", auth.accessToken);
          // Subtract 1 for the header row
          startingSrNumber = Math.max(1, existingRows.length);
          addLog(`Starting from Sr. ${startingSrNumber} (${existingRows.length - 1} existing entries)`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to read existing rows, starting from 1";
          addLog(`Warning: ${message}`);
        }
      }

      for (let index = 0; index < pendingVideos.length; index += 1) {
        const video = pendingVideos[index];
        setCurrentIndex(index);
        updateVideo(room.id, video.id, { status: "processing" });
        addLog(`Processing ${index + 1}/${pendingVideos.length}: ${video.name}`);

        try {
          addLog("  Downloading video...");
          const blob = await downloadFileAsBlob(video.id, auth.accessToken);

          addLog("  Extracting clips and screenshots...");
          const clipDefs = await extractClipsFromVideo(blob);
          addLog(`  Found ${clipDefs.length} clip(s) of 30 seconds each`);

          const clipResults: ClipEvaluationResult[] = [];
          const aiConfig = { provider: room.aiProvider, apiKey: room.aiApiKey, model: room.aiModel };

          // Get full transcript once for the entire video
          addLog("  Extracting full video transcript...");
          const fullTranscript = await extractTranscriptFromVideo(blob, aiConfig);

          // Calculate transcript segments for each clip (rough estimate based on time)
          // We'll split the transcript proportionally across clips
          const totalWords = fullTranscript.split(/\s+/).length;
          const videoDuration = clipDefs.length > 0
            ? clipDefs[clipDefs.length - 1].endTime
            : 30;

          for (let clipIdx = 0; clipIdx < clipDefs.length; clipIdx += 1) {
            const clip = clipDefs[clipIdx];
            addLog(`  Evaluating clip ${clipIdx + 1}/${clipDefs.length} (${Math.round(clip.startTime)}s - ${Math.round(clip.endTime)}s)...`);

            // Estimate transcript segment for this clip
            const startRatio = clip.startTime / videoDuration;
            const endRatio = clip.endTime / videoDuration;
            const words = fullTranscript.split(/\s+/);
            const startWord = Math.floor(startRatio * words.length);
            const endWord = Math.floor(endRatio * words.length);
            const clipTranscript = words.slice(startWord, endWord).join(" ");

            // Evaluate clip with screenshot
            const clipResult = await evaluateClipWithScreenshot(
              clipTranscript || "[No transcript for this segment]",
              clip.screenshotBase64,
              clip.screenshotMimeType,
              room.evaluationPrompt,
              aiConfig,
              room.rubrics,
              clip.clipIndex,
            );

            // Set proper time values
            clipResult.startTime = clip.startTime;
            clipResult.endTime = clip.endTime;

            clipResults.push(clipResult);
            addLog(`    Clip ${clipIdx + 1} scores: ${JSON.stringify(clipResult.scores)}`);
          }

          // Average all clip scores to get final video scores
          addLog("  Averaging scores from all clips...");
          const { averagedScores, averagedDescriptions } = averageClipScores(clipResults, room.rubrics);

          // Generate AI-summarized descriptions (one concise sentence per rubric)
          addLog("  Generating evaluation summaries...");
          const summaryConfig = { provider: room.aiProvider, apiKey: room.aiApiKey, model: room.aiModel };
          const summarizedDescriptions: Record<string, string> = {};
          for (const rubric of room.rubrics) {
            try {
              summarizedDescriptions[rubric.name] = await summarizeClipDescriptions(
                rubric.name,
                clipResults,
                averagedScores[rubric.name] || 0,
                summaryConfig,
              );
            } catch (err) {
              // Fallback to empty if summarization fails
              summarizedDescriptions[rubric.name] = '';
            }
          }

          updateVideo(room.id, video.id, {
            status: "completed",
            scores: averagedScores,
            descriptions: summarizedDescriptions,
            clipEvaluationResults: clipResults,
            averagedScores,
            averagedDescriptions: summarizedDescriptions,
          });

          // Build combined description for the sheet: one sentence per rubric explaining the score
          const combinedDescription = room.rubrics
            .map((rubric) => {
              const desc = summarizedDescriptions[rubric.name];
              return desc ? `${rubric.name}: ${desc}` : null;
            })
            .filter(Boolean)
            .join(" ");

          // Calculate total marks (sum of all rubric scores)
          const totalMarks = room.rubrics.reduce(
            (sum, rubric) => sum + (averagedScores[rubric.name] || 0),
            0,
          );

          const videoTitle = video.name.replace(/\.[^/.]+$/, "");
          const row = [
            startingSrNumber + index,
            videoTitle,
            clipDefs.length,
            ...room.rubrics.map((rubric) => averagedScores[rubric.name] || 0),
            totalMarks,
            combinedDescription,
          ];
          await appendToSheet(spreadsheetId, [row], auth.accessToken);
          addLog(`  Completed (avg across ${clipDefs.length} clips): ${JSON.stringify(averagedScores)}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to evaluate video";
          updateVideo(room.id, video.id, { status: "error", error: message });
          addLog(`  Error: ${message}`);
        }
      }

      updateRoom(room.id, { status: "completed" });
      addLog("All evaluations complete!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected evaluation error";
      updateRoom(room.id, { status: "error" });
      addLog(`Fatal error: ${message}`);
    } finally {
      setProcessing(false);
      setCurrentIndex(-1);
    }
  }, [addLog, auth.accessToken, processing, room, updateRoom, updateVideo, videos]);

  if (!room) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <p className="text-muted-foreground">Room not found</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </Button>
        </div>
      </Layout>
    );
  }

  const completedCount = videos.filter((video) => video.status === "completed").length;
  const errorCount = videos.filter((video) => video.status === "error").length;

  return (
    <Layout>
      <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => router.push("/dashboard")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
      </Button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{room.name}</h1>
          {room.description && <p className="mt-0.5 text-muted-foreground">{room.description}</p>}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded bg-secondary px-2 py-1 font-mono">{room.aiProvider}</span>
            <span>{room.rubrics.length} rubrics</span>
            <span>{videos.length} videos</span>
            <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-500">30s clip evaluation</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadVideos} disabled={loadingVideos}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loadingVideos ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            className="gradient-primary text-primary-foreground"
            size="sm"
            onClick={processVideos}
            disabled={processing || videos.length === 0}
          >
            <Play className="mr-1.5 h-4 w-4" />
            {processing ? `Processing ${currentIndex + 1}/${videos.length}` : "Start Clip Evaluation"}
          </Button>
        </div>
      </div>

      {/* API Key Prompt Dialog */}
      <AlertDialog open={showApiKeyPrompt} onOpenChange={setShowApiKeyPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>API Key Required</AlertDialogTitle>
            <AlertDialogDescription>
              No API key is configured for this room. Select a provider and enter your API key to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((provider) => (
                  <button
                    key={provider.value}
                    type="button"
                    onClick={() => setSelectedProvider(provider.value)}
                    className={`rounded-lg border p-2 text-xs font-medium transition-all ${
                      selectedProvider === provider.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/20"
                    }`}
                  >
                    {provider.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog-apiKey">API Key</Label>
              <Input
                id="dialog-apiKey"
                type="password"
                placeholder={PROVIDERS.find((p) => p.value === selectedProvider)?.placeholder}
                value={enteredApiKey}
                onChange={(e) => setEnteredApiKey(e.target.value)}
                className="font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && enteredApiKey.trim()) {
                    handleApiKeySubmit();
                  }
                }}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApiKeySubmit} disabled={!enteredApiKey.trim()}>
              Start Evaluation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-6 grid grid-cols-5 gap-3">
        {[
          { label: "Total", value: videos.length, color: "text-foreground" },
          { label: "Pending", value: videos.filter((video) => video.status === "pending").length, color: "text-muted-foreground" },
          { label: "Completed", value: completedCount, color: "text-success" },
          { label: "Errors", value: errorCount, color: "text-destructive" },
          {
            label: "Total Clips",
            value: videos.reduce((sum, v) => sum + (v.clipEvaluationResults?.length || 0), 0),
            color: "text-blue-500",
          },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-4 text-center">
            <p className={`font-mono text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {room.spreadsheetId && (
        <a
          href={`https://docs.google.com/spreadsheets/d/${room.spreadsheetId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-card mb-6 flex items-center gap-2 p-3 text-sm text-primary transition-colors hover:bg-primary/5"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Open Results Spreadsheet
          <ExternalLink className="ml-auto h-3.5 w-3.5" />
        </a>
      )}

      <div className="glass-card-elevated overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="w-10 p-3 text-left font-medium text-muted-foreground">Sr.</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Video Name</th>
              <th className="w-24 p-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="w-16 p-3 text-center font-medium text-muted-foreground">Clips</th>
              {room.rubrics.map((rubric) => (
                <th
                  key={rubric.name}
                  className="w-20 p-3 text-center font-mono text-xs font-medium text-muted-foreground"
                  title="Averaged score across all clips"
                >
                  {rubric.name} (avg)
                </th>
              ))}
              <th className="min-w-[200px] p-3 text-left font-medium text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody>
            {videos.length === 0 ? (
              <tr>
                <td colSpan={5 + room.rubrics.length} className="p-8 text-center text-muted-foreground">
                  {loadingVideos ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading videos from Drive...
                    </span>
                  ) : (
                    "No videos found in the specified folder"
                  )}
                </td>
              </tr>
            ) : (
              videos.map((video, index) => (
                <tr key={video.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                  <td className="p-3 font-mono text-muted-foreground">{index + 1}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-foreground">{video.name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {video.status === "pending" && <span className="status-badge bg-secondary text-muted-foreground">Pending</span>}
                    {video.status === "processing" && (
                      <span className="status-badge-processing">
                        <Loader2 className="h-3 w-3 animate-spin" /> Processing
                      </span>
                    )}
                    {video.status === "completed" && (
                      <span className="status-badge-success">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </span>
                    )}
                    {video.status === "error" && (
                      <span className="status-badge bg-destructive/10 text-destructive" title={video.error}>
                        <AlertCircle className="h-3 w-3" /> Error
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center font-mono text-muted-foreground">
                    {video.clipEvaluationResults?.length || "-"}
                  </td>
                  {room.rubrics.map((rubric) => (
                    <td key={rubric.name} className="p-3 text-center font-mono">
                      {video.scores?.[rubric.name] !== undefined ? (
                        <span className="font-semibold text-foreground">{video.scores[rubric.name]}</span>
                      ) : (
                        <span className="text-muted-foreground/40">-</span>
                      )}
                    </td>
                  ))}
                  <td className="p-3 text-sm text-muted-foreground">
                    {video.descriptions ? (
                      <div className="space-y-1">
                        {room.rubrics.map((rubric) => {
                          const desc = video.descriptions?.[rubric.name];
                          if (!desc) return null;
                          return (
                            <p key={rubric.name} className="text-xs leading-relaxed">
                              <span className="font-medium text-foreground">{rubric.name}:</span> {desc}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/40">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {log.length > 0 && (
        <div className="glass-card mt-6 p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Processing Log</h3>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {log.map((entry, index) => (
              <p key={`${entry}-${index}`} className="font-mono text-xs text-muted-foreground">
                {entry}
              </p>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
