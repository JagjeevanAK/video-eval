"use client";

import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, FolderSearch, Sparkles, Upload, Video } from "lucide-react";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { listVideosInFolder, openDriveFolderPicker } from "@/lib/googleApi";
import { generateEvaluationPrompt, RUBRIC_FILE_ACCEPT } from "@/lib/rubricParser";
import { parseRubricUpload } from "@/lib/rubricUpload";
import { useAppStore } from "@/stores/useAppStore";
import type { AIProvider, RubricCriteria, VideoFile } from "@/types";

const AI_PROVIDERS: { value: AIProvider; label: string; placeholder: string }[] = [
  { value: "openai", label: "OpenAI", placeholder: "sk-..." },
  { value: "claude", label: "Claude (Anthropic)", placeholder: "sk-ant-..." },
  { value: "gemini", label: "Google Gemini", placeholder: "AIza..." },
  { value: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
];
const GOOGLE_PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "";
const GOOGLE_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";

export default function CreateRoom() {
  const router = useRouter();
  const auth = useAppStore((state) => state.auth);
  const addRoom = useAppStore((state) => state.addRoom);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [folderResult, setFolderResult] = useState<{ id: string; name: string } | null>(null);
  const [folderError, setFolderError] = useState("");
  const [folderPicking, setFolderPicking] = useState(false);
  const [folderVideos, setFolderVideos] = useState<VideoFile[]>([]);
  const [folderVideosLoading, setFolderVideosLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>("gemini");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [rubrics, setRubrics] = useState<RubricCriteria[]>([]);
  const [evaluationPrompt, setEvaluationPrompt] = useState("");
  const [rubricFileName, setRubricFileName] = useState("");
  const [rubricParsing, setRubricParsing] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadFolderVideos = useCallback(async (folderId: string, accessToken: string) => {
    setFolderVideosLoading(true);

    try {
      const files = await listVideosInFolder(folderId, accessToken);
      setFolderVideos(files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        webViewLink: file.webViewLink,
        status: "pending",
      })));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load videos from selected folder";
      setFolderError(message);
      setFolderVideos([]);
    } finally {
      setFolderVideosLoading(false);
    }
  }, []);

  const handlePickFolder = useCallback(async () => {
    if (!auth.accessToken) {
      return;
    }

    if (!GOOGLE_PICKER_API_KEY) {
      setFolderError("NEXT_PUBLIC_GOOGLE_PICKER_API_KEY environment variable is not set.");
      return;
    }

    setFolderPicking(true);
    setFolderError("");
    setFolderVideos([]);

    try {
      const result = await openDriveFolderPicker({
        accessToken: auth.accessToken,
        developerKey: GOOGLE_PICKER_API_KEY,
        appId: GOOGLE_APP_ID || undefined,
      });

      if (result) {
        setFolderResult(result);
        await loadFolderVideos(result.id, auth.accessToken);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to open Google Drive picker";
      setFolderError(message);
    } finally {
      setFolderPicking(false);
    }
  }, [auth.accessToken, loadFolderVideos]);

  const handleRubricUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setRubricParsing(true);

    try {
      const parsed = await parseRubricUpload(file);
      setRubrics(parsed.rubrics);
      setRubricFileName(file.name);
      setEvaluationPrompt(generateEvaluationPrompt(parsed.rubrics, parsed.sourceText));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse rubric file";
      setRubricFileName("");
      setRubrics([]);
      setEvaluationPrompt("");
      window.alert(`Failed to parse rubric file: ${message}`);
    } finally {
      setRubricParsing(false);
      event.target.value = "";
    }
  }, []);

  const handleCreate = useCallback(() => {
    if (!name.trim() || !folderResult || rubrics.length === 0 || !aiApiKey.trim()) {
      return;
    }

    setCreating(true);

    const room = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      aiProvider,
      aiApiKey: aiApiKey.trim(),
      aiModel: aiModel.trim() || undefined,
      driveFolderId: folderResult.id,
      driveFolderName: folderResult.name,
      rubrics,
      evaluationPrompt,
      createdAt: Date.now(),
      status: "idle" as const,
    };

    addRoom(room);
    router.push(`/room/${room.id}`);
  }, [addRoom, aiApiKey, aiModel, aiProvider, description, evaluationPrompt, folderResult, name, router, rubrics]);

  const isValid = Boolean(name.trim() && folderResult && rubrics.length > 0 && aiApiKey.trim() && !rubricParsing);
  const missingRequirements = [
    !name.trim() ? "Enter a room name." : null,
    !folderResult ? "Choose a Google Drive folder." : null,
    rubrics.length === 0 && !rubricParsing ? "Upload a rubric file with at least one criterion." : null,
    rubricParsing ? "Wait for the rubric file to finish parsing." : null,
    !aiApiKey.trim() ? "Enter an AI API key." : null,
  ].filter((item): item is string => Boolean(item));
  const selectedProvider = AI_PROVIDERS.find((provider) => provider.value === aiProvider)!;

  return (
    <Layout>
      <div className="max-w-2xl">
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>

        <h1 className="mb-1 text-2xl font-bold text-foreground">Create Evaluation Room</h1>
        <p className="mb-8 text-muted-foreground">Set up a new workspace for video evaluation</p>

        <div className="space-y-8">
          <section className="glass-card-elevated animate-fade-in space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Basic Info</h2>
            <div className="space-y-2">
              <Label htmlFor="name">Room Name *</Label>
              <Input id="name" placeholder="e.g., Interview Round 1" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Input
                id="desc"
                placeholder="Optional description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </section>

          <section className="glass-card-elevated animate-fade-in space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Google Drive Folder</h2>
            <div className="space-y-2">
              <Label>Folder *</Label>
              <p className="text-xs text-muted-foreground">
                Choose a folder from My Drive, Shared with me, or shared drives using Google&apos;s picker. The picker shows folders only—videos inside will load after selection.
              </p>
              <Button variant="outline" onClick={handlePickFolder} disabled={folderPicking}>
                <FolderSearch className="mr-1.5 h-4 w-4" />
                {folderPicking ? "Opening..." : folderResult ? "Change folder" : "Choose folder"}
              </Button>
              {folderResult && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" /> Selected: {folderResult.name}
                </p>
              )}
              {folderError && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {folderError}
                </p>
              )}
            </div>

            {folderResult && (
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Videos in selected folder</p>
                    <p className="text-xs text-muted-foreground">Only videos directly inside this folder will be evaluated.</p>
                  </div>
                  <span className="rounded-full bg-background px-2.5 py-1 text-xs font-mono text-muted-foreground">
                    {folderVideosLoading ? "Loading..." : `${folderVideos.length} video${folderVideos.length === 1 ? "" : "s"}`}
                  </span>
                </div>

                {folderVideosLoading ? (
                  <p className="text-sm text-muted-foreground">Loading videos from Google Drive...</p>
                ) : folderVideos.length > 0 ? (
                  <ScrollArea className="max-h-64 rounded-lg border border-border/60 bg-background/70">
                    <div className="space-y-2 p-3">
                      {folderVideos.map((video) => (
                        <div key={video.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/80 px-3 py-2">
                          <Video className="h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{video.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{video.mimeType}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground">No top-level video files were found in this folder.</p>
                )}
              </div>
            )}
          </section>

          <section className="glass-card-elevated animate-fade-in space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Rubrics</h2>
            <div className="space-y-2">
              <Label>Upload Rubric File *</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                CSV, PDF, DOC, or DOCX. CSV can use columns{" "}
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">name</span>,{" "}
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">description</span> (optional),{" "}
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">maxScore</span> (optional, default 5). For PDF and Word
                files, use a table or bullet list with criterion names and optional score ranges.
              </p>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border p-4 transition-colors hover:border-primary/50 hover:bg-secondary/50">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {rubricParsing ? "Parsing rubric file..." : rubricFileName || "Choose CSV, PDF, DOC, or DOCX file..."}
                </span>
                <input type="file" accept={RUBRIC_FILE_ACCEPT} className="hidden" onChange={handleRubricUpload} disabled={rubricParsing} />
              </label>
            </div>

            {rubrics.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <FileText className="h-4 w-4" /> {rubrics.length} criteria loaded
                </p>
                <div className="flex flex-wrap gap-2">
                  {rubrics.map((rubric) => (
                    <span key={rubric.name} className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary">
                      {rubric.name} (1-{rubric.maxScore || 5})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {evaluationPrompt && (
            <section className="glass-card-elevated animate-fade-in space-y-4 p-6">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground">
                <Sparkles className="h-4 w-4 text-accent" /> Generated Evaluation Prompt
              </h2>
              <Textarea
                value={evaluationPrompt}
                onChange={(event) => setEvaluationPrompt(event.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                You can edit this prompt to fine-tune the evaluation criteria.
              </p>
            </section>
          )}

          <section className="glass-card-elevated animate-fade-in space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">AI Model Provider</h2>
            <div className="grid grid-cols-2 gap-2">
              {AI_PROVIDERS.map((provider) => (
                <button
                  key={provider.value}
                  type="button"
                  onClick={() => setAiProvider(provider.value)}
                  className={`rounded-lg border p-3 text-sm font-medium transition-all ${
                    aiProvider === provider.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-foreground/20"
                  }`}
                >
                  {provider.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={selectedProvider.placeholder}
                value={aiApiKey}
                onChange={(event) => setAiApiKey(event.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model (optional)</Label>
              <Input
                id="model"
                placeholder="Leave blank for default model"
                value={aiModel}
                onChange={(event) => setAiModel(event.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </section>

          <Button
            className="gradient-primary h-12 w-full text-base text-primary-foreground"
            onClick={handleCreate}
            disabled={!isValid || creating}
          >
            {creating ? "Creating..." : "Create Evaluation Room"}
          </Button>
          {!isValid && (
            <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 text-sm text-muted-foreground">
              {missingRequirements.join(" ")}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
