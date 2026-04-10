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
import { evaluateVideoTranscript, extractTranscriptFromVideo, type EvaluationResult } from "@/lib/aiEvaluator";
import {
  appendToSheet,
  createSpreadsheet,
  downloadFileAsBlob,
  listVideosInFolder,
  moveFileToFolder,
} from "@/lib/googleApi";
import { useAppStore } from "@/stores/useAppStore";
import type { VideoFile } from "@/types";

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
      const mapped: VideoFile[] = files.map((file: VideoFile) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        webViewLink: file.webViewLink,
        status: "pending" as const,
      }));

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

    setProcessing(true);
    updateRoom(room.id, { status: "processing" });
    addLog("Starting evaluation...");

    const headers = ["Sr.", "Name", ...room.rubrics.map((rubric) => rubric.name), "Description"];
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

      for (let index = 0; index < pendingVideos.length; index += 1) {
        const video = pendingVideos[index];
        setCurrentIndex(index);
        updateVideo(room.id, video.id, { status: "processing" });
        addLog(`Processing ${index + 1}/${pendingVideos.length}: ${video.name}`);

        try {
          addLog("  Downloading video...");
          const blob = await downloadFileAsBlob(video.id, auth.accessToken);

          addLog("  Extracting transcript...");
          const transcript = await extractTranscriptFromVideo(blob, {
            provider: room.aiProvider,
            apiKey: room.aiApiKey,
            model: room.aiModel,
          });

          addLog(`  Evaluating with ${room.aiProvider}...`);
          const result: EvaluationResult = await evaluateVideoTranscript(
            transcript,
            room.evaluationPrompt,
            { provider: room.aiProvider, apiKey: room.aiApiKey, model: room.aiModel },
            room.rubrics,
          );

          updateVideo(room.id, video.id, { status: "completed", scores: result.scores, descriptions: result.descriptions });

          // Build combined description: "RubricName: explanation; RubricName2: explanation2"
          const combinedDescription = room.rubrics
            .map((rubric) => {
              const desc = result.descriptions[rubric.name];
              return desc ? `${rubric.name}: ${desc}` : null;
            })
            .filter(Boolean)
            .join("; ");

          const videoTitle = video.name.replace(/\.[^/.]+$/, "");
          const row = [index + 1, videoTitle, ...room.rubrics.map((rubric) => result.scores[rubric.name] || 0), combinedDescription];
          await appendToSheet(spreadsheetId, [row], auth.accessToken);
          addLog(`  Completed: ${JSON.stringify(result.scores)}`);
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
            {processing ? `Processing ${currentIndex + 1}/${videos.length}` : "Start Evaluation"}
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-3">
        {[
          { label: "Total", value: videos.length, color: "text-foreground" },
          { label: "Pending", value: videos.filter((video) => video.status === "pending").length, color: "text-muted-foreground" },
          { label: "Completed", value: completedCount, color: "text-success" },
          { label: "Errors", value: errorCount, color: "text-destructive" },
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
              {room.rubrics.map((rubric) => (
                <th
                  key={rubric.name}
                  className="w-20 p-3 text-center font-mono text-xs font-medium text-muted-foreground"
                >
                  {rubric.name}
                </th>
              ))}
              <th className="min-w-[200px] p-3 text-left font-medium text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody>
            {videos.length === 0 ? (
              <tr>
                <td colSpan={4 + room.rubrics.length} className="p-8 text-center text-muted-foreground">
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
