"use client";

import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, FolderSearch, Sparkles, Upload } from "lucide-react";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { searchDriveFolder } from "@/lib/googleApi";
import { generateEvaluationPrompt, parseRubricsFromCSV } from "@/lib/rubricParser";
import { useAppStore } from "@/stores/useAppStore";
import type { AIProvider, RubricCriteria } from "@/types";

const AI_PROVIDERS: { value: AIProvider; label: string; placeholder: string }[] = [
  { value: "openai", label: "OpenAI", placeholder: "sk-..." },
  { value: "claude", label: "Claude (Anthropic)", placeholder: "sk-ant-..." },
  { value: "gemini", label: "Google Gemini", placeholder: "AIza..." },
  { value: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
];

export default function CreateRoom() {
  const router = useRouter();
  const auth = useAppStore((state) => state.auth);
  const addRoom = useAppStore((state) => state.addRoom);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderResult, setFolderResult] = useState<{ id: string; name: string } | null>(null);
  const [folderError, setFolderError] = useState("");
  const [folderSearching, setFolderSearching] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>("gemini");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [rubrics, setRubrics] = useState<RubricCriteria[]>([]);
  const [evaluationPrompt, setEvaluationPrompt] = useState("");
  const [rubricFileName, setRubricFileName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSearchFolder = useCallback(async () => {
    if (!folderName.trim() || !auth.accessToken) {
      return;
    }

    setFolderSearching(true);
    setFolderError("");
    setFolderResult(null);

    try {
      const result = await searchDriveFolder(folderName.trim(), auth.accessToken);

      if (result) {
        setFolderResult(result);
      } else {
        setFolderError("Folder not found in your Drive");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to search for folder";
      setFolderError(message);
    } finally {
      setFolderSearching(false);
    }
  }, [auth.accessToken, folderName]);

  const handleRubricUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = await parseRubricsFromCSV(file);
      setRubrics(parsed);
      setRubricFileName(file.name);
      setEvaluationPrompt(generateEvaluationPrompt(parsed));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse rubrics file";
      setRubricFileName("");
      setRubrics([]);
      window.alert(`Failed to parse rubrics: ${message}`);
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

  const isValid = Boolean(name.trim() && folderResult && rubrics.length > 0 && aiApiKey.trim());
  const selectedProvider = AI_PROVIDERS.find((provider) => provider.value === aiProvider)!;

  return (
    <Layout>
      <div className="max-w-2xl">
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => router.push("/")}>
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
              <Label htmlFor="folder">Folder Name *</Label>
              <div className="flex gap-2">
                <Input
                  id="folder"
                  placeholder="Enter exact folder name from Drive"
                  value={folderName}
                  onChange={(event) => {
                    setFolderName(event.target.value);
                    setFolderResult(null);
                    setFolderError("");
                  }}
                />
                <Button variant="outline" onClick={handleSearchFolder} disabled={folderSearching || !folderName.trim()}>
                  <FolderSearch className="mr-1.5 h-4 w-4" />
                  {folderSearching ? "Searching..." : "Find"}
                </Button>
              </div>
              {folderResult && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" /> Found: {folderResult.name}
                </p>
              )}
              {folderError && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {folderError}
                </p>
              )}
            </div>
          </section>

          <section className="glass-card-elevated animate-fade-in space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Rubrics</h2>
            <div className="space-y-2">
              <Label>Upload Rubrics CSV *</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                CSV with columns: <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">name</span>,{" "}
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">description</span> (optional),{" "}
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">maxScore</span> (optional, default 5)
              </p>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border p-4 transition-colors hover:border-primary/50 hover:bg-secondary/50">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{rubricFileName || "Choose CSV file..."}</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleRubricUpload} />
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
        </div>
      </div>
    </Layout>
  );
}
