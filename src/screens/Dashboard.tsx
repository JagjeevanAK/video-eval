"use client";

import Link from "next/link";
import { ArrowRight, Clock, Cpu, FolderOpen, Plus, Trash2, Video } from "lucide-react";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import type { Room } from "@/types";

const statusConfig = {
  idle: { label: "Ready", className: "status-badge bg-secondary text-muted-foreground" },
  processing: { label: "Processing", className: "status-badge-processing" },
  completed: { label: "Completed", className: "status-badge-success" },
  error: { label: "Error", className: "status-badge bg-destructive/10 text-destructive" },
};

const providerLabels = { openai: "OpenAI", claude: "Claude", gemini: "Gemini", openrouter: "OpenRouter", groq: "Groq" };

function RoomCard({ room }: { room: Room }) {
  const deleteRoom = useAppStore((state) => state.deleteRoom);
  const status = statusConfig[room.status];

  return (
    <div className="glass-card-elevated group p-5 transition-shadow hover:shadow-lg animate-fade-in">
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-foreground">{room.name}</h3>
          {room.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{room.description}</p>
          )}
        </div>
        <span className={status.className}>{status.label}</span>
      </div>

      <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5" />
          {room.driveFolderName}
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5" />
          {providerLabels[room.aiProvider]}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {new Date(room.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="rounded bg-secondary px-2 py-1 font-mono">
          {room.rubrics.length} rubric{room.rubrics.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full flex-1 transition-colors group-hover:border-primary group-hover:text-primary"
        >
          <Link href={`/room/${room.id}`}>
            Open Room <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => deleteRoom(room.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const rooms = useAppStore((state) => state.rooms);

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Evaluation Rooms</h1>
          <p className="mt-1 text-muted-foreground">Manage your video evaluation workspaces</p>
        </div>
        <Button asChild className="gradient-primary text-primary-foreground">
          <Link href="/create">
            <Plus className="mr-2 h-4 w-4" /> New Room
          </Link>
        </Button>
      </div>

      {rooms.length === 0 ? (
        <div className="glass-card-elevated animate-fade-in p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mb-1 text-lg font-semibold text-foreground">No rooms yet</h3>
          <p className="mx-auto mb-6 max-w-sm text-muted-foreground">
            Create your first evaluation room to start assessing videos with AI-powered rubrics.
          </p>
          <Button asChild className="gradient-primary text-primary-foreground">
            <Link href="/create">
              <Plus className="mr-2 h-4 w-4" /> Create Room
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </Layout>
  );
}
