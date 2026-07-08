"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ChangeEvent,
  type ComponentType,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
  type UIEvent,
} from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/unipar-ui/avatar";
import { Button } from "@/components/unipar-ui/button";
import { Checkbox } from "@/components/unipar-ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/unipar-ui/dialog";
import { Input } from "@/components/unipar-ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/unipar-ui/popover";
import { Textarea } from "@/components/unipar-ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/unipar-ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/unipar-ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/unipar-ui/context-menu";
import {
  ArrowLeft,
  ChevronDown,
  MoreVertical,
  Search,
  Send,
  Paperclip,
  Mic,
  MicOff,
  Smile,
  Plus,
  Reply,
  Forward,
  Copy,
  Trash2,
  BellOff,
  Flag,
  FileText,
  Pause,
  Pin,
  Star,
  Pencil,
  Eraser,
  Info,
  AlertTriangle,
  Ban,
  Check,
  CheckCheck,
  X,
  Play,
  Phone,
  PhoneOff,
  Download,
  ZoomIn,
  ZoomOut,
  PanelTop,
  Video,
  VideoOff,
} from "lucide-react";
import {
  formatLastSeenAt,
  getChatPresenceMeta,
  getChatPresenceStatus,
  hideMessageForUser,
  isMessageFavoriteForUser,
  isMessageHiddenForUser,
  isMessagePinnedForUser,
  toggleMessageFavoriteForUser,
  toggleMessagePinnedForUser,
  type Contact,
  type DirectoryUser,
  type Message,
  formatTime,
} from "@/lib/chat-data";
import { cn } from "@/lib/utils";
import {
  getUploadSizeLimitMessage,
  splitFilesByUploadSize,
} from "@/lib/upload-limits";
import { uploadFileAttachment } from "@/lib/upload-client";
import { toast } from "sonner";

export type ForwardTarget = {
  id: string;
  name: string;
  avatar: string;
  email: string;
  isOnline: boolean;
  kind: "contact" | "group";
};

const MESSAGE_PAGE_SIZE = 40;
const MESSAGE_TEXT_CHUNK_SIZE = 1000;
const MESSAGE_INPUT_MAX_ROWS = 5;
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const LONG_PRESS_DURATION_MS = 1000;
const AUDIO_PROGRESS_THUMB_SIZE = 12;
const AUDIO_PROGRESS_THUMB_HALF_SIZE = AUDIO_PROGRESS_THUMB_SIZE / 2;
const CURRENT_USER_MESSAGE_NAME = "Você";
const recordingWaveform = [
  14, 28, 18, 34, 20, 44, 22, 36, 18, 30, 16, 46, 24, 38, 20, 32, 18, 40, 22,
  34, 16, 28, 14, 36, 18, 30,
];
const EMOJI_OPTIONS = [
  "😀",
  "😄",
  "😂",
  "😊",
  "😍",
  "😎",
  "😢",
  "😡",
  "👍",
  "👎",
  "🙏",
  "👏",
  "🔥",
  "✅",
  "⚠️",
  "❤️",
  "🎉",
  "📌",
  "📎",
  "💬",
  "🚀",
  "☕",
  "💻",
  "📄",
];

function getMessageSnippet(message: Message) {
  if (message.deletedForEveryone) return "Mensagem apagada";

  const content = message.content.trim();

  if (content) return content;

  switch (message.attachment?.type) {
    case "image":
      return "Foto";
    case "video":
      return "Vídeo";
    case "audio":
      return "Áudio";
    case "document":
      return message.attachment.name;
    default:
      return "Mensagem";
  }
}

function formatMediaDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatMessageDateSeparator(date: Date) {
  const messageDay = getStartOfDay(date);
  const today = getStartOfDay(new Date());
  const diffDays = Math.floor(
    (today.getTime() - messageDay.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString("pt-BR", { weekday: "long" });
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isMediaMessage(message: Message) {
  return (
    !message.deletedForMe &&
    !message.deletedForEveryone &&
    (message.attachment?.type === "image" ||
      message.attachment?.type === "video")
  );
}

function getMediaSource(message: Message) {
  const attachment = message.attachment;

  if (attachment?.type === "image") return attachment.src;
  if (attachment?.type === "video")
    return attachment.src ?? attachment.thumbnail;

  return "";
}

function getMediaThumbSource(message: Message) {
  const attachment = message.attachment;

  if (attachment?.type === "image") return attachment.src;
  if (attachment?.type === "video") return attachment.thumbnail;

  return "";
}

function MediaToolbarButton({
  active,
  className,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  className?: string;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 rounded-full text-white hover:bg-white/10 hover:text-white sm:h-10 sm:w-10",
            active && "bg-white/15",
            disabled && "pointer-events-none opacity-25",
            className,
          )}
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
        >
          <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function EmojiPickerButton({
  align = "center",
  buttonClassName,
  onSelectEmoji,
  side = "top",
}: {
  align?: "center" | "end" | "start";
  buttonClassName?: string;
  onSelectEmoji: (emoji: string) => void;
  side?: "bottom" | "left" | "right" | "top";
}) {
  const [open, setOpen] = useState(false);

  const handleSelectEmoji = (emoji: string) => {
    onSelectEmoji(emoji);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("text-muted-foreground", buttonClassName)}
          aria-label="Abrir emojis"
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-64 p-2">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted"
              onClick={() => handleSelectEmoji(emoji)}
              aria-label={`Inserir emoji ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type PendingAttachmentKind = "image" | "video" | "audio" | "document";
type ChatCallKind = "audio" | "video";
type ChatCallStatus = "starting" | "active" | "failed";

interface ActiveChatCall {
  kind: ChatCallKind;
  status: ChatCallStatus;
  startedAt: Date;
  errorMessage?: string;
}

interface PendingAttachment {
  id: string;
  file: File;
  kind: PendingAttachmentKind;
  url: string | null;
  extension: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createMessageId(userId: string) {
  const randomValue =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `m-${userId}-${randomValue}`;
}

function revokeTemporaryAttachmentUrl(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatCallDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function getCallMediaErrorMessage(error: unknown, callKind: ChatCallKind) {
  const mediaLabel = callKind === "video" ? "camera e microfone" : "microfone";

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return `Permita o acesso ao ${mediaLabel} para iniciar a chamada.`;
    }

    if (error.name === "NotFoundError") {
      return `Nao encontrei ${mediaLabel} neste dispositivo.`;
    }

    if (error.name === "NotReadableError") {
      return `O ${mediaLabel} ja esta em uso por outro aplicativo.`;
    }
  }

  return `Nao foi possivel acessar ${mediaLabel}.`;
}

function getClientErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir a operação.";
}

function getMessageTimestampTime(message: Message) {
  const timestamp =
    message.timestamp instanceof Date
      ? message.timestamp
      : new Date(message.timestamp);

  return Number.isFinite(timestamp.getTime()) ? timestamp.getTime() : 0;
}

function isMessageWithinEditWindow(message: Message) {
  const timestampTime = getMessageTimestampTime(message);

  return timestampTime > 0 && Date.now() - timestampTime <= MESSAGE_EDIT_WINDOW_MS;
}

function getAudioFileExtension(mimeType: string) {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";

  return "webm";
}

function downloadDocumentAttachment(
  attachment: Extract<NonNullable<Message["attachment"]>, { type: "document" }>,
) {
  const downloadLink = document.createElement("a");
  let temporaryUrl: string | null = null;

  if (attachment.src) {
    downloadLink.href = attachment.src;
  } else {
    const fileContent = `Arquivo de exemplo: ${attachment.name}\n${attachment.meta}`;
    const fileBlob = new Blob([fileContent], {
      type: "application/octet-stream",
    });

    temporaryUrl = URL.createObjectURL(fileBlob);
    downloadLink.href = temporaryUrl;
  }

  downloadLink.download = attachment.name;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  if (temporaryUrl) {
    URL.revokeObjectURL(temporaryUrl);
  }
}

function AudioMessageAttachmentPreview({
  attachment,
  isOwnMessage,
  messageId,
  senderAvatar,
  senderName,
}: {
  attachment: Extract<NonNullable<Message["attachment"]>, { type: "audio" }>;
  isOwnMessage: boolean;
  messageId: string;
  senderAvatar: string;
  senderName: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const displayTime =
    currentTime > 0 || isPlaying
      ? formatRecordingTime(Math.floor(currentTime))
      : attachment.duration;
  const progressThumbLeft = `calc(${AUDIO_PROGRESS_THUMB_HALF_SIZE}px + ${
    progress * 100
  }% - ${progress * AUDIO_PROGRESS_THUMB_SIZE}px)`;

  useEffect(() => {
    const audioElement = audioRef.current;

    if (!audioElement) return;

    const handleLoadedMetadata = () => {
      setDuration(
        Number.isFinite(audioElement.duration) ? audioElement.duration : 0,
      );
    };
    const handleTimeUpdate = () => {
      const safeDuration = Number.isFinite(audioElement.duration)
        ? audioElement.duration
        : 0;

      setCurrentTime(
        safeDuration > 0
          ? Math.min(audioElement.currentTime, safeDuration)
          : audioElement.currentTime,
      );
    };
    const handlePlay = () => {
      window.dispatchEvent(
        new CustomEvent("unipar-audio-play", { detail: { messageId } }),
      );
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      const safeDuration = Number.isFinite(audioElement.duration)
        ? audioElement.duration
        : 0;

      setIsPlaying(false);
      setCurrentTime(safeDuration);
    };

    audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    audioElement.addEventListener("timeupdate", handleTimeUpdate);
    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("ended", handleEnded);
    handleLoadedMetadata();

    return () => {
      audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.removeEventListener("timeupdate", handleTimeUpdate);
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("ended", handleEnded);
    };
  }, [messageId]);

  useEffect(() => {
    const handleOtherAudioPlay = (event: Event) => {
      const customEvent = event as CustomEvent<{ messageId?: string }>;

      if (customEvent.detail?.messageId === messageId) return;

      audioRef.current?.pause();
    };

    window.addEventListener("unipar-audio-play", handleOtherAudioPlay);

    return () => {
      window.removeEventListener("unipar-audio-play", handleOtherAudioPlay);
    };
  }, [messageId]);

  const handleTogglePlayback = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const audioElement = audioRef.current;

    if (!audioElement) return;

    if (audioElement.paused) {
      if (duration > 0 && audioElement.currentTime >= duration - 0.05) {
        audioElement.currentTime = 0;
        setCurrentTime(0);
      }

      void audioElement.play();
      return;
    }

    audioElement.pause();
  };

  const handleSeek = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const audioElement = audioRef.current;

    if (!audioElement || duration <= 0) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const trackWidth = Math.max(
      1,
      bounds.width - AUDIO_PROGRESS_THUMB_HALF_SIZE * 2,
    );
    const nextProgress = Math.min(
      1,
      Math.max(
        0,
        (event.clientX - bounds.left - AUDIO_PROGRESS_THUMB_HALF_SIZE) /
          trackWidth,
      ),
    );

    audioElement.currentTime = nextProgress * duration;
    setCurrentTime(audioElement.currentTime);
  };

  return (
    <div className="mb-1 flex w-[21rem] max-w-full items-center gap-3">
      <div className="relative h-12 w-12 shrink-0">
        <Avatar className="h-12 w-12">
          <AvatarImage src={senderAvatar} alt={senderName} />
          <AvatarFallback>
            {senderName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2",
            isOwnMessage
              ? "border-chat-outgoing bg-chat-outgoing text-primary"
              : "border-chat-incoming bg-chat-incoming text-primary",
          )}
        >
          <Mic className="h-3 w-3" />
        </span>
      </div>
      <button
        type="button"
        disabled={!attachment.src}
        onClick={handleTogglePlayback}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          isOwnMessage
            ? "text-primary-foreground hover:bg-black/10"
            : "text-foreground hover:bg-muted/60",
        )}
        aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="h-5 w-5 fill-current" />
        )}
      </button>
      {attachment.src && (
        <audio
          ref={audioRef}
          preload="metadata"
          src={attachment.src}
          className="sr-only"
        />
      )}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          disabled={!attachment.src}
          onClick={handleSeek}
          className="relative inline-flex h-9 max-w-full items-center gap-0.5 px-1.5 align-middle"
          aria-label="Avançar ou voltar áudio"
        >
          <span
            className="pointer-events-none absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 shadow-sm transition-[left] duration-75"
            style={{ left: progressThumbLeft }}
          />
          {attachment.waveform.map((height, index) => {
            const barProgress =
              attachment.waveform.length <= 1
                ? 1
                : index / (attachment.waveform.length - 1);

            return (
              <span
                key={`${messageId}-wave-${index}`}
                className={cn(
                  "w-1 shrink-0 rounded-full transition-colors duration-75",
                  barProgress <= progress
                    ? "bg-sky-400"
                    : "bg-muted-foreground/55",
                )}
                style={{ height: `${Math.max(height * 0.72, 12)}%` }}
              />
            );
          })}
        </button>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {displayTime}
        </div>
      </div>
    </div>
  );
}

function MessageAttachmentPreview({
  isOwnMessage,
  message,
  onOpenMediaViewer,
  senderAvatar,
  senderName,
}: {
  isOwnMessage: boolean;
  message: Message;
  onOpenMediaViewer: (messageId: string) => void;
  senderAvatar: string;
  senderName: string;
}) {
  const attachment = message.attachment;

  if (!attachment) return null;

  if (attachment.type === "image") {
    return (
      <button
        type="button"
        aria-label={attachment.alt}
        className="mb-2 block h-56 w-64 max-w-full rounded-md bg-cover bg-center transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={(event) => {
          event.stopPropagation();
          onOpenMediaViewer(message.id);
        }}
        style={{ backgroundImage: `url(${attachment.src})` }}
      />
    );
  }

  if (attachment.type === "video") {
    if (attachment.src) {
      return (
        <button
          type="button"
          className="relative mb-2 block h-56 w-64 max-w-full overflow-hidden rounded-md bg-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={(event) => {
            event.stopPropagation();
            onOpenMediaViewer(message.id);
          }}
          aria-label="Abrir vídeo"
        >
          <video
            className="h-full w-full object-cover"
            muted
            src={attachment.src}
          />
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="h-6 w-6 fill-white" />
          </span>
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-xs font-medium text-white">
            <Play className="h-3 w-3 fill-white" />
            {attachment.duration}
          </span>
        </button>
      );
    }

    return (
      <button
        type="button"
        className="relative mb-2 block h-56 w-64 max-w-full overflow-hidden rounded-md bg-cover bg-center transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={(event) => {
          event.stopPropagation();
          onOpenMediaViewer(message.id);
        }}
        aria-label="Abrir vídeo"
        style={{ backgroundImage: `url(${attachment.thumbnail})` }}
      >
        <div className="absolute inset-0 bg-black/20" />
        <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white">
          <Play className="h-6 w-6 fill-white" />
        </span>
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-xs font-medium text-white">
          <Play className="h-3 w-3 fill-white" />
          {attachment.duration}
        </span>
      </button>
    );
  }

  if (attachment.type === "audio") {
    return (
      <AudioMessageAttachmentPreview
        attachment={attachment}
        isOwnMessage={isOwnMessage}
        messageId={message.id}
        senderAvatar={senderAvatar}
        senderName={senderName}
      />
    );
  }

  return (
    <div className="mb-2 flex min-w-[14rem] max-w-full items-center gap-3 rounded-md bg-background/45 p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-destructive text-[10px] font-bold text-destructive-foreground">
        {attachment.extension}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{attachment.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {attachment.meta}
        </div>
      </div>
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
        aria-label="Baixar documento"
        onClick={(event) => {
          event.stopPropagation();
          downloadDocumentAttachment(attachment);
        }}
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

function MessageText({ message }: { message: Message }) {
  const [textPagination, setTextPagination] = useState({
    messageId: message.id,
    visibleCharacters: MESSAGE_TEXT_CHUNK_SIZE,
  });
  const content = message.content.trim();

  if (!content) return null;

  const visibleCharacters =
    textPagination.messageId === message.id
      ? textPagination.visibleCharacters
      : MESSAGE_TEXT_CHUNK_SIZE;
  const isCollapsed = content.length > visibleCharacters;
  const visibleContent = isCollapsed
    ? content.slice(0, visibleCharacters)
    : content;

  return (
    <div className="min-w-0 max-w-full">
      <p className="max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
        {visibleContent}
      </p>
      {isCollapsed && (
        <button
          type="button"
          className="mt-1 text-xs font-semibold text-primary hover:underline"
          onClick={() => {
            setTextPagination((pagination) => ({
              messageId: message.id,
              visibleCharacters:
                (pagination.messageId === message.id
                  ? pagination.visibleCharacters
                  : MESSAGE_TEXT_CHUNK_SIZE) + MESSAGE_TEXT_CHUNK_SIZE,
            }));
          }}
        >
          Ler mais
        </button>
      )}
    </div>
  );
}

function MessageStatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sent":
      return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3.5 w-3.5 text-sky-400" />;
    default:
      return null;
  }
}

function AttachmentComposer({
  attachments,
  activeAttachmentId,
  caption,
  onCaptionChange,
  onSelectAttachment,
  onRemoveAttachment,
  onAddMore,
  onClose,
  onSend,
}: {
  attachments: PendingAttachment[];
  activeAttachmentId: string;
  caption: string;
  onCaptionChange: (caption: string) => void;
  onSelectAttachment: (attachmentId: string) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onAddMore: () => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const activeAttachment =
    attachments.find((attachment) => attachment.id === activeAttachmentId) ??
    attachments[0];

  if (!activeAttachment) return null;

  const isDocument = activeAttachment.kind === "document";
  const isAudio = activeAttachment.kind === "audio";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={onClose}
          aria-label="Fechar anexo"
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="w-8" />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
        {activeAttachment.kind === "image" && activeAttachment.url && (
          <div
            aria-label={activeAttachment.file.name}
            role="img"
            className="h-full max-h-[34rem] w-full max-w-4xl rounded bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${activeAttachment.url})` }}
          />
        )}

        {activeAttachment.kind === "video" && activeAttachment.url && (
          <video
            controls
            src={activeAttachment.url}
            className="max-h-full max-w-full rounded bg-black"
          />
        )}

        {(isDocument || isAudio) && (
          <div className="flex w-full max-w-sm flex-col items-center justify-center rounded-lg bg-muted/50 px-8 py-10 text-center">
            <FileText className="h-20 w-20 text-foreground" />
            <div className="mt-6 text-2xl text-foreground">
              Prévia indisponível
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {formatFileSize(activeAttachment.file.size)} -{" "}
              {activeAttachment.extension}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t bg-card px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            rows={1}
            value={caption}
            onChange={(event) => onCaptionChange(event.target.value)}
            placeholder="Digite uma mensagem"
            className="thin-gray-scrollbar max-h-24 min-h-10 flex-1 resize-none bg-muted py-2 leading-5"
          />
          <EmojiPickerButton
            align="end"
            onSelectEmoji={(emoji) => onCaptionChange(`${caption}${emoji}`)}
          />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className={cn(
                "group/thumb relative h-14 w-14 overflow-hidden rounded border bg-muted transition-colors",
                attachment.id === activeAttachment.id
                  ? "border-primary ring-2 ring-primary"
                  : "border-border hover:border-primary/70",
              )}
            >
              <button
                type="button"
                className="flex h-full w-full items-center justify-center"
                onClick={() => onSelectAttachment(attachment.id)}
                aria-label={`Selecionar ${attachment.file.name}`}
              >
                {attachment.kind === "image" && attachment.url ? (
                  <div
                    aria-hidden="true"
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${attachment.url})` }}
                  />
                ) : attachment.kind === "video" && attachment.url ? (
                  <video
                    src={attachment.url}
                    className="h-full w-full object-cover"
                    muted
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                    <span className="text-[9px] font-bold text-muted-foreground">
                      {attachment.extension}
                    </span>
                  </div>
                )}
              </button>
              <button
                type="button"
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-90 transition-opacity hover:bg-black group-hover/thumb:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveAttachment(attachment.id);
                }}
                aria-label={`Remover ${attachment.file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          <button
            type="button"
            className="flex h-14 w-14 items-center justify-center rounded border border-border text-foreground transition-colors hover:border-primary hover:bg-muted"
            onClick={onAddMore}
            aria-label="Adicionar mais arquivos"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      <Button
        size="icon-lg"
        className="absolute bottom-5 right-5 h-14 w-14 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={onSend}
        aria-label="Enviar anexos"
      >
        <Send className="h-7 w-7" />
      </Button>
    </div>
  );
}

interface ChatWindowProps {
  contact: Contact;
  currentUser: DirectoryUser;
  forwardTargets: ForwardTarget[];
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  isGroup?: boolean;
  groupParticipants?: DirectoryUser[];
  highlightedMessageId: string | null;
  onForwardMessage: (targetIds: string[], message: Message) => void;
  onBack: () => void;
  onShowContactDetails: () => void;
  onShowMessageSearch: () => void;
  onMuteConversation: () => void;
  onPinConversation: () => void;
  onReportConversation: () => void;
  onReportMessage: (message: Message, description: string) => void;
  onClearConversation: () => void;
  onDeleteConversation: () => void;
  onStartCall?: (kind: ChatCallKind) => void;
  isCallActionDisabled?: boolean;
  onTypingChange?: (isTyping: boolean) => void;
  onPriorityMessageSent?: (message: Message) => void;
}

function getForwardTargetKey(target: ForwardTarget) {
  return `${target.kind}:${target.id}`;
}

export function ChatWindow({
  contact,
  currentUser,
  forwardTargets,
  messages,
  setMessages,
  isGroup = false,
  groupParticipants = [],
  highlightedMessageId,
  onForwardMessage,
  onBack,
  onShowContactDetails,
  onShowMessageSearch,
  onMuteConversation,
  onPinConversation,
  onReportConversation,
  onReportMessage,
  onClearConversation,
  onDeleteConversation,
  onStartCall,
  isCallActionDisabled = false,
  onTypingChange,
  onPriorityMessageSent,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isPriority, setIsPriority] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveRecordingWaveform, setLiveRecordingWaveform] =
    useState<number[]>(recordingWaveform);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [activePendingAttachmentId, setActivePendingAttachmentId] = useState<
    string | null
  >(null);
  const [attachmentCaption, setAttachmentCaption] = useState("");
  const [messagePagination, setMessagePagination] = useState({
    contactId: "",
    count: MESSAGE_PAGE_SIZE,
  });
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(
    null,
  );
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardQuery, setForwardQuery] = useState("");
  const [selectedForwardTargetIds, setSelectedForwardTargetIds] = useState<
    string[]
  >([]);
  const [reportMessage, setReportMessage] = useState<Message | null>(null);
  const [reportText, setReportText] = useState("");
  const [activePinnedMessageId, setActivePinnedMessageId] = useState<
    string | null
  >(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isDeleteSelectionMode, setIsDeleteSelectionMode] = useState(false);
  const [selectedDeleteMessageIds, setSelectedDeleteMessageIds] = useState<
    string[]
  >([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCancelRecordingConfirmOpen, setIsCancelRecordingConfirmOpen] =
    useState(false);
  const [isSendingAudioRecording, setIsSendingAudioRecording] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveChatCall | null>(null);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isCallCameraEnabled, setIsCallCameraEnabled] = useState(true);
  const [mediaViewerMessageId, setMediaViewerMessageId] = useState<
    string | null
  >(null);
  const [mediaZoom, setMediaZoom] = useState(1);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [activeLongPressMessageId, setActiveLongPressMessageId] = useState<
    string | null
  >(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const messageLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnimationFrameRef = useRef<number | null>(null);
  const recordingFallbackIntervalRef = useRef<number | null>(null);
  const isRecordingAudioRef = useRef(false);
  const isRecordingPausedRef = useRef(false);
  const messageLongPressTriggeredRef = useRef(false);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const isAtLatestMessageRef = useRef(true);
  const latestVisibleMessageKeyRef = useRef<string | null>(null);
  const previousContactIdRef = useRef(contact.id);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingAudioChunksRef = useRef<Blob[]>([]);
  const callStreamRef = useRef<MediaStream | null>(null);
  const callVideoRef = useRef<HTMLVideoElement | null>(null);
  const callRequestIdRef = useRef(0);
  const isAttachmentComposerOpen = pendingAttachments.length > 0;
  const conversationLabel = isGroup ? "grupo" : "conversa";
  const contactPresenceStatus = getChatPresenceStatus(contact);
  const contactPresence = getChatPresenceMeta(contact);
  const contactPresenceLabel =
    !isGroup && contactPresenceStatus === "offline"
      ? formatLastSeenAt(contact.lastSeenAt)
      : contactPresence.label;
  const groupOnlineParticipants = groupParticipants.filter(
    (participant) => getChatPresenceStatus(participant) === "online",
  );
  const groupHeaderStatus = `${groupParticipants.length} participante${
    groupParticipants.length === 1 ? "" : "s"
  } • ${groupOnlineParticipants.length} online`;
  const typingText =
    contact.typingText ?? (isGroup ? "digitando..." : "digitando...");
  const activeCallTitle =
    activeCall?.kind === "video" ? "Chamada de video" : "Chamada de audio";
  const activeCallStatusLabel =
    activeCall?.status === "failed"
      ? "Falha ao iniciar"
      : activeCall?.status === "starting"
        ? "Preparando chamada"
        : "Chamando";
  const callActionsDisabled =
    isAttachmentComposerOpen || Boolean(activeCall) || isCallActionDisabled;
  const shouldRunCallTimer = Boolean(
    activeCall && activeCall.status !== "failed",
  );
  const activeCallStartedAtTime = activeCall?.startedAt.getTime() ?? 0;
  const visibleMessageCount =
    messagePagination.contactId === contact.id
      ? messagePagination.count
      : MESSAGE_PAGE_SIZE;
  const messagesVisibleToCurrentUser = useMemo(
    () =>
      messages.filter(
        (message) => !isMessageHiddenForUser(message, currentUser.id),
      ),
    [currentUser.id, messages],
  );
  const pinnedMessages = messages.filter(
    (message) =>
      isMessagePinnedForUser(message, currentUser.id) &&
      !isMessageHiddenForUser(message, currentUser.id) &&
      !message.deletedForEveryone,
  );
  const activePinnedMessage =
    pinnedMessages.find((message) => message.id === activePinnedMessageId) ??
    pinnedMessages[pinnedMessages.length - 1] ??
    null;
  const activePinnedMessageIndex = activePinnedMessage
    ? pinnedMessages.findIndex(
        (message) => message.id === activePinnedMessage.id,
      )
    : -1;
  const filteredForwardTargets = useMemo(() => {
    const normalizedQuery = forwardQuery.trim().toLowerCase();

    if (!normalizedQuery) return forwardTargets;

    return forwardTargets.filter(
      (target) =>
        target.name.toLowerCase().includes(normalizedQuery) ||
        target.email.toLowerCase().includes(normalizedQuery) ||
        target.kind.toLowerCase().includes(normalizedQuery),
    );
  }, [forwardQuery, forwardTargets]);

  const isMessageOwn = useCallback((message: Message) => {
    if (message.senderId) return message.senderId === currentUser.id;

    return message.isOwn;
  }, [currentUser.id]);

  const canEditMessage = (message: Message) =>
    isMessageOwn(message) &&
    !message.deletedForEveryone &&
    message.attachment?.type !== "audio" &&
    isMessageWithinEditWindow(message);

  const getMessageSenderName = (message: Message) => {
    if (isMessageOwn(message)) return CURRENT_USER_MESSAGE_NAME;
    if (message.senderName) return message.senderName;
    if (message.senderId) {
      return (
        groupParticipants.find(
          (participant) => participant.id === message.senderId,
        )?.name ?? "Participante"
      );
    }

    return isGroup ? "Participante" : contact.name;
  };

  const getMessageSenderAvatar = (message: Message) => {
    if (isMessageOwn(message)) return currentUser.avatar;

    if (message.senderId) {
      return (
        groupParticipants.find(
          (participant) => participant.id === message.senderId,
        )?.avatar ?? contact.avatar
      );
    }

    return contact.avatar;
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.scrollTo({
      top: scrollElement.scrollHeight,
      behavior,
    });
    isAtLatestMessageRef.current = true;
    setShowScrollToLatest(false);
  }, []);

  const requestScrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    requestAnimationFrame(() => {
      scrollToBottom(behavior);
      requestAnimationFrame(() => scrollToBottom(behavior));
      window.setTimeout(() => scrollToBottom("auto"), 120);
    });
  }, [scrollToBottom]);

  const clearCallMedia = () => {
    if (callVideoRef.current) {
      callVideoRef.current.srcObject = null;
    }

    stopMediaStream(callStreamRef.current);
    callStreamRef.current = null;
  };

  const handleEndCall = () => {
    callRequestIdRef.current += 1;
    clearCallMedia();
    setActiveCall(null);
    setCallElapsedSeconds(0);
    setIsCallMuted(false);
    setIsCallCameraEnabled(true);
  };

  const handleStartCall = async (callKind: ChatCallKind) => {
    if (isGroup) {
      toast.info("Ligacoes estao disponiveis apenas em conversas individuais.");
      return;
    }

    if (activeCall && activeCall.status !== "failed") {
      toast.info("Finalize a chamada atual antes de iniciar outra.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Seu navegador nao suporta chamadas por aqui.");
      return;
    }

    const requestId = callRequestIdRef.current + 1;
    callRequestIdRef.current = requestId;
    clearCallMedia();
    setCallElapsedSeconds(0);
    setIsCallMuted(false);
    setIsCallCameraEnabled(callKind === "video");
    setActiveCall({
      kind: callKind,
      status: "starting",
      startedAt: new Date(),
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: callKind === "video" ? { facingMode: "user" } : false,
      });

      if (callRequestIdRef.current !== requestId) {
        stopMediaStream(stream);
        return;
      }

      callStreamRef.current = stream;
      setActiveCall({
        kind: callKind,
        status: "active",
        startedAt: new Date(),
      });
      toast.success(`Ligando para ${contact.name}.`);
    } catch (error) {
      if (callRequestIdRef.current !== requestId) return;

      const errorMessage = getCallMediaErrorMessage(error, callKind);

      clearCallMedia();
      setActiveCall({
        kind: callKind,
        status: "failed",
        startedAt: new Date(),
        errorMessage,
      });
      toast.error(errorMessage);
    }
  };

  const handleRetryCall = () => {
    if (!activeCall) return;

    void handleStartCall(activeCall.kind);
  };

  const handleCallActionClick = (callKind: ChatCallKind) => {
    if (onStartCall) {
      onStartCall(callKind);
      return;
    }

    void handleStartCall(callKind);
  };

  const handleToggleCallMuted = () => {
    const nextMuted = !isCallMuted;

    callStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsCallMuted(nextMuted);
  };

  const handleToggleCallCamera = () => {
    if (activeCall?.kind !== "video") return;

    const nextEnabled = !isCallCameraEnabled;

    callStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsCallCameraEnabled(nextEnabled);
  };

  useEffect(() => {
    const didChangeContact = previousContactIdRef.current !== contact.id;
    let endCallTimeoutId: number | null = null;

    previousContactIdRef.current = contact.id;

    if (didChangeContact) {
      callRequestIdRef.current += 1;

      if (callVideoRef.current) {
        callVideoRef.current.srcObject = null;
      }

      stopMediaStream(callStreamRef.current);
      callStreamRef.current = null;
      endCallTimeoutId = window.setTimeout(() => {
        setActiveCall(null);
        setCallElapsedSeconds(0);
        setIsCallMuted(false);
        setIsCallCameraEnabled(true);
      }, 0);
    }

    pendingScrollRestoreRef.current = null;
    shouldScrollToBottomRef.current = true;
    isAtLatestMessageRef.current = true;
    latestVisibleMessageKeyRef.current = null;
    requestAnimationFrame(() => {
      messageInputRef.current?.focus({ preventScroll: true });
    });

    return () => {
      if (endCallTimeoutId !== null) {
        window.clearTimeout(endCallTimeoutId);
      }
    };
  }, [contact.id]);

  useEffect(() => {
    if (!shouldRunCallTimer) return;

    const intervalId = window.setInterval(() => {
      setCallElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeCallStartedAtTime, shouldRunCallTimer]);

  useEffect(() => {
    const videoElement = callVideoRef.current;

    if (!videoElement || activeCall?.kind !== "video") return;

    videoElement.srcObject = callStreamRef.current;

    if (callStreamRef.current) {
      void videoElement.play().catch(() => undefined);
    }

    return () => {
      videoElement.srcObject = null;
    };
  }, [activeCall?.kind, activeCall?.status]);

  useEffect(() => {
    isRecordingAudioRef.current = isRecordingAudio;
  }, [isRecordingAudio]);

  useEffect(() => {
    isRecordingPausedRef.current = isRecordingPaused;
  }, [isRecordingPaused]);

  useEffect(() => {
    if (!inputValue.trim()) {
      onTypingChange?.(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onTypingChange?.(false);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [inputValue, onTypingChange]);

  useEffect(() => {
    if (!isRecordingAudio || isRecordingPaused) return;

    const intervalId = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRecordingAudio, isRecordingPaused]);

  useEffect(() => {
    return () => {
      if (recordingAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(recordingAnimationFrameRef.current);
      }

      if (recordingFallbackIntervalRef.current !== null) {
        window.clearInterval(recordingFallbackIntervalRef.current);
      }

      const mediaRecorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      recordingAudioChunksRef.current = [];
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.ondataavailable = null;
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
      }

      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      clearCallMedia();

      const audioContext = recordingAudioContextRef.current;
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const inputElement = messageInputRef.current;
    if (!inputElement) return;

    const lineHeight = Number.parseFloat(
      window.getComputedStyle(inputElement).lineHeight,
    );
    const paddingTop = Number.parseFloat(
      window.getComputedStyle(inputElement).paddingTop,
    );
    const paddingBottom = Number.parseFloat(
      window.getComputedStyle(inputElement).paddingBottom,
    );
    const maxHeight =
      lineHeight * MESSAGE_INPUT_MAX_ROWS + paddingTop + paddingBottom;

    if (!inputValue) {
      inputElement.style.height = "2.5rem";
      inputElement.style.overflowY = "hidden";
      return;
    }

    inputElement.style.height = "auto";
    inputElement.style.height = `${Math.min(inputElement.scrollHeight, maxHeight)}px`;
    inputElement.style.overflowY =
      inputElement.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [inputValue]);

  useEffect(() => {
    const latestMessage = messagesVisibleToCurrentUser.at(-1);
    const latestMessageKey = latestMessage
      ? `${contact.id}:${latestMessage.id}`
      : `${contact.id}:empty`;
    const previousLatestMessageKey = latestVisibleMessageKeyRef.current;

    latestVisibleMessageKeyRef.current = latestMessageKey;

    if (
      !latestMessage ||
      previousLatestMessageKey === null ||
      previousLatestMessageKey === latestMessageKey
    ) {
      return;
    }

    if (isMessageOwn(latestMessage) || isAtLatestMessageRef.current) {
      shouldScrollToBottomRef.current = true;
      return;
    }

    setShowScrollToLatest(true);
  }, [contact.id, isMessageOwn, messagesVisibleToCurrentUser]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const previousScrollHeight = pendingScrollRestoreRef.current;

    if (previousScrollHeight !== null) {
      pendingScrollRestoreRef.current = null;
      requestAnimationFrame(() => {
        const currentScrollElement = scrollRef.current;
        if (!currentScrollElement) return;

        currentScrollElement.scrollTop =
          currentScrollElement.scrollHeight - previousScrollHeight;
      });
      return;
    }

    if (shouldScrollToBottomRef.current) {
      shouldScrollToBottomRef.current = false;
      requestScrollToBottom();
    }
  }, [messages, requestScrollToBottom, visibleMessageCount]);

  useEffect(() => {
    if (!highlightedMessageId) return;

    const messageIndex = messagesVisibleToCurrentUser.findIndex(
      (message) => message.id === highlightedMessageId,
    );

    if (messageIndex === -1) return;

    const requiredVisibleCount =
      messagesVisibleToCurrentUser.length - messageIndex;

    if (requiredVisibleCount > visibleMessageCount) {
      requestAnimationFrame(() => {
        setMessagePagination({
          contactId: contact.id,
          count:
            Math.ceil(requiredVisibleCount / MESSAGE_PAGE_SIZE) *
            MESSAGE_PAGE_SIZE,
        });
      });
      return;
    }

    requestAnimationFrame(() => {
      messageRefs.current[highlightedMessageId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [
    contact.id,
    highlightedMessageId,
    messagesVisibleToCurrentUser,
    visibleMessageCount,
  ]);

  const visibleMessages = messagesVisibleToCurrentUser.slice(
    Math.max(messagesVisibleToCurrentUser.length - visibleMessageCount, 0),
  );
  const visibleMessageItems = visibleMessages.flatMap((message, index) => {
    const previousMessage = visibleMessages[index - 1];
    const shouldShowDateSeparator =
      !previousMessage ||
      getDateKey(previousMessage.timestamp) !== getDateKey(message.timestamp);

    return [
      ...(shouldShowDateSeparator
        ? [
            {
              id: `date-${getDateKey(message.timestamp)}`,
              date: message.timestamp,
              type: "date" as const,
            },
          ]
        : []),
      {
        id: message.id,
        message,
        type: "message" as const,
      },
    ];
  });
  const mediaMessages = messagesVisibleToCurrentUser.filter(isMediaMessage);
  const mediaViewerMessage =
    mediaMessages.find((message) => message.id === mediaViewerMessageId) ??
    null;
  const mediaViewerAttachment = mediaViewerMessage?.attachment;
  const mediaViewerIndex = mediaViewerMessage
    ? mediaMessages.findIndex((message) => message.id === mediaViewerMessage.id)
    : -1;
  const mediaViewerPinDisabled =
    Boolean(
      mediaViewerMessage &&
        !isMessagePinnedForUser(mediaViewerMessage, currentUser.id),
    ) &&
    pinnedMessages.length >= 3;
  const selectedDeleteMessages = messagesVisibleToCurrentUser.filter(
    (message) => selectedDeleteMessageIds.includes(message.id),
  );
  const canDeleteSelectedForEveryone =
    selectedDeleteMessages.length > 0 &&
    selectedDeleteMessages.every((message) => isMessageOwn(message));

  const scrollToMessage = (messageId: string) => {
    const messageIndex = messagesVisibleToCurrentUser.findIndex(
      (message) => message.id === messageId,
    );

    if (messageIndex === -1) return;

    const requiredVisibleCount =
      messagesVisibleToCurrentUser.length - messageIndex;
    const scroll = () => {
      messageRefs.current[messageId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    };

    if (requiredVisibleCount > visibleMessageCount) {
      setMessagePagination({
        contactId: contact.id,
        count:
          Math.ceil(requiredVisibleCount / MESSAGE_PAGE_SIZE) *
          MESSAGE_PAGE_SIZE,
      });
      requestAnimationFrame(() => requestAnimationFrame(scroll));
      return;
    }

    requestAnimationFrame(scroll);
  };

  const handlePinnedMessageBarClick = () => {
    if (!activePinnedMessage || pinnedMessages.length === 0) return;

    const currentIndex =
      activePinnedMessageIndex >= 0
        ? activePinnedMessageIndex
        : pinnedMessages.length - 1;
    const nextIndex = (currentIndex + 1) % pinnedMessages.length;

    scrollToMessage(activePinnedMessage.id);

    if (pinnedMessages.length > 1) {
      setActivePinnedMessageId(pinnedMessages[nextIndex].id);
    }
  };

  const handleOpenMediaViewer = (messageId: string) => {
    setMediaViewerMessageId(messageId);
    setMediaZoom(1);
  };

  const handleCloseMediaViewer = () => {
    setMediaViewerMessageId(null);
    setMediaZoom(1);
  };

  const handleSelectMediaViewerMessage = (messageId: string) => {
    setMediaViewerMessageId(messageId);
    setMediaZoom(1);
  };

  const handleNavigateMediaViewer = (direction: -1 | 1) => {
    if (mediaMessages.length === 0 || mediaViewerIndex === -1) return;

    const nextIndex =
      (mediaViewerIndex + direction + mediaMessages.length) %
      mediaMessages.length;

    handleSelectMediaViewerMessage(mediaMessages[nextIndex].id);
  };

  const handleDownloadMedia = async (message: Message) => {
    const source = getMediaSource(message);

    if (!source) return;

    const attachment = message.attachment;
    const extension = attachment?.type === "video" ? "mp4" : "jpg";
    const fileName = `${getMessageSnippet(message).replace(/\s+/g, "-").toLowerCase()}-${message.id}.${extension}`;
    const downloadLink = document.createElement("a");

    try {
      const response = await fetch(source);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      downloadLink.href = objectUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      downloadLink.href = source;
      downloadLink.download = fileName;
      downloadLink.target = "_blank";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    }
  };

  const handleReplyFromMediaViewer = (message: Message) => {
    handleReplyMessage(message);
    handleCloseMediaViewer();
  };

  const handleForwardFromMediaViewer = (message: Message) => {
    handleOpenForwardDialog(message);
    handleCloseMediaViewer();
  };

  const handleMessagesScroll = (event: UIEvent<HTMLDivElement>) => {
    const scrollElement = event.currentTarget;
    const distanceFromBottom =
      scrollElement.scrollHeight -
      scrollElement.scrollTop -
      scrollElement.clientHeight;
    const isAtLatestMessage = distanceFromBottom <= 96;

    isAtLatestMessageRef.current = isAtLatestMessage;
    setShowScrollToLatest(distanceFromBottom > 180);

    if (visibleMessageCount >= messagesVisibleToCurrentUser.length) return;

    if (scrollElement.scrollTop > 96) return;

    pendingScrollRestoreRef.current = scrollElement.scrollHeight;
    setMessagePagination((pagination) => ({
      contactId: contact.id,
      count: Math.min(
        (pagination.contactId === contact.id
          ? pagination.count
          : MESSAGE_PAGE_SIZE) + MESSAGE_PAGE_SIZE,
        messagesVisibleToCurrentUser.length,
      ),
    }));
  };

  const handleScrollToLatestMessage = () => {
    scrollToBottom("smooth");
  };

  const openAttachmentPicker = () => {
    if (isUploadingAttachment) return;

    attachmentInputRef.current?.click();
  };

  const handleAttachmentInputChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) return;

    const { acceptedFiles, rejectedFiles } = splitFilesByUploadSize(files);

    if (rejectedFiles.length > 0) {
      toast.error("Arquivo acima de 16 MB.", {
        description: getUploadSizeLimitMessage(rejectedFiles.length),
      });
    }

    if (acceptedFiles.length === 0) {
      event.target.value = "";
      return;
    }

    setIsUploadingAttachment(true);

    const uploadResults = await Promise.allSettled(
      acceptedFiles.map(async (file) => {
        const upload = await uploadFileAttachment(file);

        return {
          id: upload.id,
          file,
          kind: upload.kind,
          url: upload.url,
          extension: upload.extension || "ARQ",
        } satisfies PendingAttachment;
      }),
    );

    setIsUploadingAttachment(false);

    const newAttachments = uploadResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const rejectedUploads = uploadResults.filter(
      (result) => result.status === "rejected",
    );

    if (rejectedUploads.length > 0) {
      toast.error(
        rejectedUploads.length === 1
          ? "Não foi possível enviar 1 anexo."
          : `Não foi possível enviar ${rejectedUploads.length} anexos.`,
        {
          description: getClientErrorMessage(
            rejectedUploads[0].status === "rejected"
              ? rejectedUploads[0].reason
              : undefined,
          ),
        },
      );
    }

    if (newAttachments.length > 0) {
      setPendingAttachments((currentAttachments) => [
        ...currentAttachments,
        ...newAttachments,
      ]);
      setActivePendingAttachmentId(
        (currentId) => currentId ?? newAttachments[0].id,
      );
    }

    event.target.value = "";
  };

  const handleCloseAttachmentComposer = () => {
    pendingAttachments.forEach((attachment) => {
      revokeTemporaryAttachmentUrl(attachment.url);
    });
    setPendingAttachments([]);
    setActivePendingAttachmentId(null);
    setAttachmentCaption("");
  };

  const handleRemovePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((currentAttachments) => {
      const removedAttachment = currentAttachments.find(
        (attachment) => attachment.id === attachmentId,
      );
      revokeTemporaryAttachmentUrl(removedAttachment?.url ?? null);

      const nextAttachments = currentAttachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );

      setActivePendingAttachmentId((currentId) => {
        if (currentId !== attachmentId) return currentId;

        return nextAttachments[0]?.id ?? null;
      });

      if (nextAttachments.length === 0) {
        setAttachmentCaption("");
      }

      return nextAttachments;
    });
  };

  const scheduleOutgoingStatusUpdates = (messageIds: string[]) => {
    setTimeout(() => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          messageIds.includes(message.id) &&
          message.status === "sent" &&
          !message.deletedForEveryone
            ? { ...message, status: "delivered" }
            : message,
        ),
      );
    }, 1000);
  };

  const handleSendAttachments = () => {
    if (pendingAttachments.length === 0) return;

    const caption = attachmentCaption.trim();
    const attachmentMessages: Message[] = pendingAttachments.map(
      (attachment, index) => {
        const baseMessage = {
          id: createMessageId(currentUser.id),
          content: index === 0 ? caption : "",
          timestamp: new Date(Date.now() + index),
          isOwn: true,
          senderId: currentUser.id,
          senderName: currentUser.name,
          status: "sent" as const,
          isPriority,
        };

        if (attachment.kind === "image") {
          return {
            ...baseMessage,
            attachment: {
              type: "image" as const,
              src: attachment.url ?? "",
              alt: attachment.file.name,
            },
          };
        }

        if (attachment.kind === "video") {
          return {
            ...baseMessage,
            attachment: {
              type: "video" as const,
              src: attachment.url ?? "",
              thumbnail: attachment.url ?? "",
              duration: "0:00",
              title: attachment.file.name,
            },
          };
        }

        if (attachment.kind === "audio") {
          return {
            ...baseMessage,
            attachment: {
              type: "audio" as const,
              src: attachment.url ?? undefined,
              duration: "0:00",
              waveform: [
                24, 44, 32, 58, 36, 64, 42, 30, 54, 46, 34, 60, 38, 28, 50, 40,
              ],
            },
          };
        }

        return {
          ...baseMessage,
          attachment: {
            type: "document" as const,
            name: attachment.file.name,
            meta: `${formatFileSize(attachment.file.size)} - ${attachment.extension}`,
            extension: attachment.extension,
            src: attachment.url ?? undefined,
          },
        };
      },
    );

    shouldScrollToBottomRef.current = true;
    setMessages((currentMessages) => [
      ...currentMessages,
      ...attachmentMessages,
    ]);
    scheduleOutgoingStatusUpdates(
      attachmentMessages.map((message) => message.id),
    );
    if (isPriority) {
      onPriorityMessageSent?.(attachmentMessages[0]);
    }
    setPendingAttachments([]);
    setActivePendingAttachmentId(null);
    setAttachmentCaption("");
    onTypingChange?.(false);
    setIsPriority(false);
  };

  const appendRecordingWaveformBar = (height: number) => {
    setLiveRecordingWaveform((currentWaveform) => {
      const waveform =
        currentWaveform.length > 0 ? currentWaveform : recordingWaveform;

      return [...waveform.slice(1), height];
    });
  };

  const stopRecordingWaveformFallback = () => {
    if (recordingFallbackIntervalRef.current === null) return;

    window.clearInterval(recordingFallbackIntervalRef.current);
    recordingFallbackIntervalRef.current = null;
  };

  const startRecordingWaveformFallback = () => {
    if (recordingFallbackIntervalRef.current !== null) return;

    recordingFallbackIntervalRef.current = window.setInterval(() => {
      if (isRecordingPausedRef.current) return;

      appendRecordingWaveformBar(Math.round(14 + Math.random() * 58));
    }, 90);
  };

  const stopRecordingInput = () => {
    if (recordingAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(recordingAnimationFrameRef.current);
      recordingAnimationFrameRef.current = null;
    }

    stopRecordingWaveformFallback();

    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;

    const audioContext = recordingAudioContextRef.current;
    recordingAudioContextRef.current = null;

    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
  };

  const discardRecordingAudio = () => {
    const mediaRecorder = mediaRecorderRef.current;

    mediaRecorderRef.current = null;
    recordingAudioChunksRef.current = [];

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
  };

  const finishRecordingAudio = () =>
    new Promise<{ blob: Blob; mimeType: string } | undefined>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;

      const createAudioBlob = (mimeType = "audio/webm") => {
        const chunks = recordingAudioChunksRef.current;

        mediaRecorderRef.current = null;
        recordingAudioChunksRef.current = [];

        if (chunks.length === 0) {
          resolve(undefined);
          return;
        }

        resolve({
          blob: new Blob(chunks, { type: mimeType }),
          mimeType,
        });
      };

      if (!mediaRecorder) {
        createAudioBlob();
        return;
      }

      const mimeType = mediaRecorder.mimeType || "audio/webm";

      if (mediaRecorder.state === "inactive") {
        createAudioBlob(mimeType);
        return;
      }

      mediaRecorder.onstop = () => createAudioBlob(mimeType);
      mediaRecorder.stop();
    });

  const startRecordingInput = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      if (!isRecordingAudioRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const AudioContextConstructor =
        window.AudioContext ??
        (
          window as Window &
            typeof globalThis & {
              webkitAudioContext?: typeof AudioContext;
            }
        ).webkitAudioContext;

      if (!AudioContextConstructor) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      stopRecordingWaveformFallback();

      recordingStreamRef.current = stream;

      if (typeof MediaRecorder !== "undefined") {
        try {
          const mediaRecorder = new MediaRecorder(stream);

          recordingAudioChunksRef.current = [];
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              recordingAudioChunksRef.current.push(event.data);
            }
          };
          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.start();
        } catch {
          mediaRecorderRef.current = null;
          recordingAudioChunksRef.current = [];
        }
      }

      const audioContext = new AudioContextConstructor();
      recordingAudioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        void audioContext.resume().catch(() => undefined);
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const sampleData = new Uint8Array(analyser.frequencyBinCount);
      let lastSampleAt = 0;

      const animateRecordingWaveform = (timestamp: number) => {
        if (!isRecordingAudioRef.current) return;

        if (!isRecordingPausedRef.current && timestamp - lastSampleAt >= 85) {
          analyser.getByteTimeDomainData(sampleData);

          let squaredTotal = 0;
          for (let index = 0; index < sampleData.length; index += 1) {
            const normalizedSample = (sampleData[index] - 128) / 128;
            squaredTotal += normalizedSample * normalizedSample;
          }

          const volume = Math.sqrt(squaredTotal / sampleData.length);
          const boostedVolume = Math.min(1, volume * 5);
          const nextHeight = Math.round(
            Math.min(88, Math.max(12, 12 + boostedVolume * 72)),
          );

          appendRecordingWaveformBar(nextHeight);
          lastSampleAt = timestamp;
        }

        recordingAnimationFrameRef.current = window.requestAnimationFrame(
          animateRecordingWaveform,
        );
      };

      recordingAnimationFrameRef.current = window.requestAnimationFrame(
        animateRecordingWaveform,
      );
    } catch {
      startRecordingWaveformFallback();
    }
  };

  const handleStartAudioRecording = () => {
    isRecordingAudioRef.current = true;
    isRecordingPausedRef.current = false;
    discardRecordingAudio();
    stopRecordingInput();
    setIsRecordingAudio(true);
    setIsRecordingPaused(false);
    setRecordingSeconds(0);
    setLiveRecordingWaveform(recordingWaveform);
    startRecordingWaveformFallback();
    void startRecordingInput();
  };

  const handleCancelAudioRecording = () => {
    isRecordingAudioRef.current = false;
    isRecordingPausedRef.current = false;
    discardRecordingAudio();
    stopRecordingInput();
    setIsCancelRecordingConfirmOpen(false);
    setIsRecordingAudio(false);
    setIsRecordingPaused(false);
    setRecordingSeconds(0);
    setLiveRecordingWaveform(recordingWaveform);
  };

  const handleToggleRecordingPaused = () => {
    setIsRecordingPaused((current) => {
      const nextValue = !current;
      const mediaRecorder = mediaRecorderRef.current;

      isRecordingPausedRef.current = nextValue;

      if (mediaRecorder) {
        if (nextValue && mediaRecorder.state === "recording") {
          mediaRecorder.pause();
        } else if (!nextValue && mediaRecorder.state === "paused") {
          mediaRecorder.resume();
        }
      }

      return nextValue;
    });
  };

  const handleSendAudioRecording = async () => {
    if (isSendingAudioRecording) return;

    setIsSendingAudioRecording(true);
    isRecordingAudioRef.current = false;
    isRecordingPausedRef.current = false;

    const recordingDuration = formatRecordingTime(recordingSeconds);
    const recordingWaveformSnapshot = liveRecordingWaveform;

    try {
      const recordedAudio = await finishRecordingAudio();
      stopRecordingInput();

      if (!recordedAudio) {
        toast.error("Não foi possível capturar o áudio gravado.");
        return;
      }

      const extension = getAudioFileExtension(recordedAudio.mimeType);
      const fileName = `audio-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.${extension}`;
      const upload = await uploadFileAttachment(recordedAudio.blob, fileName);
      const newMessage: Message = {
        id: createMessageId(currentUser.id),
        content: "",
        timestamp: new Date(),
        isOwn: true,
        senderId: currentUser.id,
        senderName: currentUser.name,
        status: "sent",
        isPriority,
        attachment: {
          type: "audio",
          src: upload.url,
          duration: recordingDuration,
          waveform: recordingWaveformSnapshot,
        },
      };

      shouldScrollToBottomRef.current = true;
      setMessages((currentMessages) => [...currentMessages, newMessage]);
      scheduleOutgoingStatusUpdates([newMessage.id]);
      if (isPriority) {
        onPriorityMessageSent?.(newMessage);
      }
      onTypingChange?.(false);
      setIsPriority(false);
    } catch (error) {
      stopRecordingInput();
      toast.error("Não foi possível enviar o áudio.", {
        description: getClientErrorMessage(error),
      });
    } finally {
      setIsSendingAudioRecording(false);
      setIsRecordingAudio(false);
      setIsRecordingPaused(false);
      setIsCancelRecordingConfirmOpen(false);
      setRecordingSeconds(0);
      setLiveRecordingWaveform(recordingWaveform);
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: createMessageId(currentUser.id),
      content: inputValue,
      timestamp: new Date(),
      isOwn: true,
      senderId: currentUser.id,
      senderName: currentUser.name,
      status: "sent",
      isPriority,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            content: replyingTo.content,
            senderName: getMessageSenderName(replyingTo),
          }
        : undefined,
    };

    shouldScrollToBottomRef.current = true;
    setMessages((currentMessages) => [...currentMessages, newMessage]);
    scheduleOutgoingStatusUpdates([newMessage.id]);
    if (isPriority) {
      onPriorityMessageSent?.(newMessage);
    }
    setInputValue("");
    setReplyingTo(null);
    onTypingChange?.(false);
    setIsPriority(false);
  };

  const handleInsertMessageEmoji = (emoji: string) => {
    setInputValue((currentValue) => `${currentValue}${emoji}`);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const handleCopyMessage = (message: Message) => {
    navigator.clipboard
      .writeText(message.content || getMessageSnippet(message))
      .then(() => toast.success("Mensagem copiada."))
      .catch(() => toast.error("Não foi possível copiar a mensagem."));
  };

  const handleStartDeleteSelection = (messageId: string) => {
    setOpenMessageMenuId(null);
    setIsDeleteSelectionMode(true);
    setSelectedDeleteMessageIds([messageId]);
  };

  const handleCancelDeleteSelection = () => {
    setIsDeleteSelectionMode(false);
    setSelectedDeleteMessageIds([]);
    setIsDeleteConfirmOpen(false);
  };

  const handleToggleDeleteSelection = (messageId: string) => {
    setSelectedDeleteMessageIds((currentIds) =>
      currentIds.includes(messageId)
        ? currentIds.filter((currentId) => currentId !== messageId)
        : [...currentIds, messageId],
    );
  };

  const handleDeleteSelectedForMe = () => {
    if (selectedDeleteMessageIds.length === 0) return;

    const selectedIds = new Set(selectedDeleteMessageIds);

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        selectedIds.has(message.id)
          ? hideMessageForUser(message, currentUser.id)
          : message,
      ),
    );
    handleCancelDeleteSelection();
    toast.success("Mensagem apagada para você.");
  };

  const handleDeleteSelectedForEveryone = () => {
    if (!canDeleteSelectedForEveryone) return;

    const selectedIds = new Set(selectedDeleteMessageIds);

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        selectedIds.has(message.id)
          ? {
              ...message,
              content: "",
              attachment: undefined,
              replyTo: undefined,
              isPriority: false,
              isPinned: false,
              isFavorite: false,
              pinnedForUserIds: [],
              favoriteForUserIds: [],
              messagePreferencesByUserId: {},
              deletedForEveryone: true,
            }
          : message,
      ),
    );
    handleCancelDeleteSelection();
    toast.success("Mensagem apagada para todos.");
  };

  const handleReplyMessage = (message: Message) => {
    setReplyingTo(message);
  };

  const handleOpenEditDialog = (message: Message) => {
    if (
      !isMessageOwn(message) ||
      message.deletedForEveryone ||
      message.attachment?.type === "audio"
    ) {
      return;
    }

    if (!isMessageWithinEditWindow(message)) {
      toast.warning(
        "O prazo de 15 minutos para editar esta mensagem expirou.",
      );
      return;
    }

    setEditingMessage(message);
    setEditValue(message.content);
  };

  const handleEditDialogOpenChange = (open: boolean) => {
    if (open) return;

    setEditingMessage(null);
    setEditValue("");
  };

  const handleSaveEditedMessage = () => {
    if (!editingMessage || !editValue.trim()) return;

    const currentMessage =
      messages.find((message) => message.id === editingMessage.id) ??
      editingMessage;

    if (!canEditMessage(currentMessage)) {
      toast.warning(
        "O prazo de 15 minutos para editar esta mensagem expirou.",
      );
      handleEditDialogOpenChange(false);
      return;
    }

    const updatedContent = editValue.trim();

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === editingMessage.id
          ? {
              ...message,
              content: updatedContent,
              isEdited:
                message.isEdited ||
                updatedContent !== editingMessage.content.trim(),
            }
          : message,
      ),
    );
    handleEditDialogOpenChange(false);
    toast.success("Mensagem editada.");
  };

  const handleOpenForwardDialog = (message: Message) => {
    setForwardMessage(message);
    setForwardQuery("");
    setSelectedForwardTargetIds([]);
  };

  const handleForwardDialogOpenChange = (open: boolean) => {
    if (open) return;

    setForwardMessage(null);
    setForwardQuery("");
    setSelectedForwardTargetIds([]);
  };

  const toggleForwardTarget = (targetId: string) => {
    setSelectedForwardTargetIds((currentTargetIds) =>
      currentTargetIds.includes(targetId)
        ? currentTargetIds.filter(
            (currentTargetId) => currentTargetId !== targetId,
          )
        : [...currentTargetIds, targetId],
    );
  };

  const handleSendForwardMessage = () => {
    if (!forwardMessage) return;

    if (selectedForwardTargetIds.length === 0) {
      toast.error("Selecione ao menos uma conversa.");
      return;
    }

    shouldScrollToBottomRef.current = selectedForwardTargetIds.includes(
      `${isGroup ? "group" : "contact"}:${contact.id}`,
    );
    onForwardMessage(selectedForwardTargetIds, forwardMessage);
    handleForwardDialogOpenChange(false);
    toast.success("Mensagem encaminhada.");
  };

  const handleOpenReportDialog = (message: Message) => {
    setReportMessage(message);
    setReportText("");
  };

  const handleReportDialogOpenChange = (open: boolean) => {
    if (open) return;

    setReportMessage(null);
    setReportText("");
  };

  const handleSubmitReport = () => {
    if (!reportMessage) return;

    if (!reportText.trim()) {
      toast.error("Informe o motivo da denúncia.");
      return;
    }

    onReportMessage(reportMessage, reportText.trim());
    handleReportDialogOpenChange(false);
    toast.success("Denuncia enviada.");
  };

  const handleTogglePinMessage = (message: Message) => {
    const isPinned = isMessagePinnedForUser(message, currentUser.id);

    if (!isPinned && pinnedMessages.length >= 3) {
      toast.warning("Limite de mensagens fixadas atingido.");
      return;
    }

    if (!isPinned) {
      setActivePinnedMessageId(message.id);
    } else if (activePinnedMessageId === message.id) {
      setActivePinnedMessageId(null);
    }

    setMessages((currentMessages) =>
      currentMessages.map((currentMessage) =>
        currentMessage.id === message.id
          ? toggleMessagePinnedForUser(currentMessage, currentUser.id)
          : currentMessage,
      ),
    );
    toast.success(isPinned ? "Mensagem desfixada." : "Mensagem fixada.");
  };

  const handleToggleFavoriteMessage = (message: Message) => {
    const isFavorite = isMessageFavoriteForUser(message, currentUser.id);

    setMessages((currentMessages) =>
      currentMessages.map((currentMessage) =>
        currentMessage.id === message.id
          ? toggleMessageFavoriteForUser(currentMessage, currentUser.id)
          : currentMessage,
      ),
    );
    toast.success(
      isFavorite
        ? "Mensagem removida dos favoritos."
        : "Mensagem favoritada.",
    );
  };

  const clearMessageLongPress = () => {
    if (!messageLongPressTimerRef.current) return;

    clearTimeout(messageLongPressTimerRef.current);
    messageLongPressTimerRef.current = null;
  };

  const cancelMessageLongPress = () => {
    clearMessageLongPress();
    setActiveLongPressMessageId(null);
  };

  const handleMessageLongPressStart = (messageId: string) => {
    clearMessageLongPress();
    setActiveLongPressMessageId(messageId);
    messageLongPressTriggeredRef.current = false;
    messageLongPressTimerRef.current = setTimeout(() => {
      messageLongPressTriggeredRef.current = true;
      setOpenMessageMenuId(messageId);
    }, LONG_PRESS_DURATION_MS);
  };

  const handleMessageTouchEnd = () => {
    clearMessageLongPress();

    if (messageLongPressTriggeredRef.current) {
      setTimeout(() => {
        messageLongPressTriggeredRef.current = false;
      }, 350);
      return;
    }

    setActiveLongPressMessageId(null);
  };

  const handleMessageClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!messageLongPressTriggeredRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    messageLongPressTriggeredRef.current = false;
  };

  const getMessageActions = (message: Message) => {
    if (message.deletedForEveryone) return [];

    const isPinned = isMessagePinnedForUser(message, currentUser.id);
    const isFavorite = isMessageFavoriteForUser(message, currentUser.id);
    const pinLimitReached = !isPinned && pinnedMessages.length >= 3;

    return [
      {
        id: "copy",
        label: "Copiar",
        icon: Copy,
        onSelect: () => handleCopyMessage(message),
      },
      {
        id: "reply",
        label: "Responder",
        icon: Reply,
        onSelect: () => handleReplyMessage(message),
      },
      {
        id: "forward",
        label: "Encaminhar",
        icon: Forward,
        onSelect: () => handleOpenForwardDialog(message),
      },
      ...(!isMessageOwn(message)
        ? [
            {
              id: "report",
              label: "Denunciar",
              icon: Flag,
              onSelect: () => handleOpenReportDialog(message),
            },
          ]
        : []),
      {
        id: "pin",
        label: isPinned
          ? "Desfixar"
          : pinLimitReached
            ? "Limite de 3 fixadas"
            : "Fixar",
        icon: Pin,
        disabled: pinLimitReached,
        onSelect: () => handleTogglePinMessage(message),
      },
      {
        id: "favorite",
        label: isFavorite ? "Desfavoritar" : "Favoritar",
        icon: Star,
        onSelect: () => handleToggleFavoriteMessage(message),
      },
    ];
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-2 md:px-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <button
          className="flex items-center gap-3"
          onClick={onShowContactDetails}
        >
          <div className="relative">
            <Avatar className="h-9 w-9 ring-1 ring-border">
              <AvatarImage src={contact.avatar} alt={contact.name} />
              <AvatarFallback>
                {contact.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!isGroup && (
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                  contactPresence.dotClassName,
                )}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate font-medium text-foreground">
              {contact.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {contact.isTyping ? (
                <span className="text-primary">{typingText}</span>
              ) : isGroup ? (
                groupHeaderStatus
              ) : (
                contactPresenceLabel
              )}
            </span>
          </div>
        </button>

        <div className="ml-auto flex items-center">
          {!isGroup && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={() => handleCallActionClick("audio")}
                disabled={callActionsDisabled}
                aria-disabled={callActionsDisabled}
                aria-label={`Ligar por audio para ${contact.name}`}
                title="Ligacao de audio"
              >
                <Phone className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={() => handleCallActionClick("video")}
                disabled={callActionsDisabled}
                aria-disabled={callActionsDisabled}
                aria-label={`Ligar por video para ${contact.name}`}
                title="Chamada de video"
              >
                <Video className="h-5 w-5" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={onShowMessageSearch}
            disabled={isAttachmentComposerOpen}
            aria-disabled={isAttachmentComposerOpen}
          >
            <Search className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                disabled={isAttachmentComposerOpen}
                aria-disabled={isAttachmentComposerOpen}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuItem
                className="whitespace-nowrap"
                onClick={onShowContactDetails}
              >
                <Info className="mr-2 h-4 w-4 shrink-0" />
                Ver Informações
              </DropdownMenuItem>
              <DropdownMenuItem
                className="whitespace-nowrap"
                onClick={onShowMessageSearch}
              >
                <Search className="mr-2 h-4 w-4 shrink-0" />
                Pesquisar mensagem
              </DropdownMenuItem>
              <DropdownMenuItem
                className="whitespace-nowrap"
                onClick={onMuteConversation}
              >
                <BellOff className="mr-2 h-4 w-4 shrink-0" />
                {contact.isMuted
                  ? isGroup
                    ? "Reativar grupo"
                    : "Reativar notificação"
                  : `Silenciar ${conversationLabel}`}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="whitespace-nowrap"
                onClick={onPinConversation}
              >
                <Pin
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    contact.isPinned && "text-muted-foreground",
                  )}
                />
                {contact.isPinned
                  ? `Desfixar ${conversationLabel}`
                  : `Fixar ${conversationLabel}`}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="whitespace-nowrap"
                onClick={onReportConversation}
              >
                <Flag className="mr-2 h-4 w-4 shrink-0" />
                Denunciar {conversationLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="whitespace-nowrap"
                onClick={onClearConversation}
              >
                <Eraser className="mr-2 h-4 w-4 shrink-0" />
                Limpar {conversationLabel}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="whitespace-nowrap text-destructive focus:text-destructive"
                onClick={onDeleteConversation}
              >
                <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                Apagar {conversationLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        disabled={isUploadingAttachment}
        onChange={handleAttachmentInputChange}
      />

      <Dialog
        open={Boolean(forwardMessage)}
        onOpenChange={handleForwardDialogOpenChange}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Encaminhar mensagem</DialogTitle>
            <DialogDescription className="sr-only">
              Escolha os contatos ou grupos que receberão esta mensagem.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b bg-card p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar contato ou grupo"
                value={forwardQuery}
                onChange={(event) => setForwardQuery(event.target.value)}
                className="bg-muted pl-10"
              />
            </div>
          </div>

          <div className="thin-gray-scrollbar max-h-[min(28rem,calc(100vh-16rem))] overflow-y-auto overscroll-contain">
            <div className="divide-y">
              {filteredForwardTargets.map((target) => {
                const targetKey = getForwardTargetKey(target);
                const isSelected = selectedForwardTargetIds.includes(targetKey);

                return (
                  <div
                    key={targetKey}
                    className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                    onClick={() => toggleForwardTarget(targetKey)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleForwardTarget(targetKey)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Selecionar ${target.name}`}
                    />
                    <div className="relative">
                      <Avatar className="h-11 w-11">
                        <AvatarImage src={target.avatar} alt={target.name} />
                        <AvatarFallback>
                          {target.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {target.kind === "contact" && (
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-popover",
                            getChatPresenceMeta(target).dotClassName,
                          )}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {target.name}
                        </span>
                        {target.kind === "group" && (
                          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Grupo
                          </span>
                        )}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {target.email}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredForwardTargets.length === 0 && (
                <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  Nenhum contato ou grupo encontrado
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {selectedForwardTargetIds.length} selecionado
              {selectedForwardTargetIds.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => handleForwardDialogOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSendForwardMessage}
                disabled={selectedForwardTargetIds.length === 0}
              >
                Encaminhar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reportMessage)}
        onOpenChange={handleReportDialogOpenChange}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Denunciar mensagem</DialogTitle>
            <DialogDescription className="sr-only">
              Descreva o motivo da denúncia desta mensagem.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <span className="line-clamp-2">
              {reportMessage ? getMessageSnippet(reportMessage) : ""}
            </span>
          </div>

          <Textarea
            value={reportText}
            onChange={(event) => setReportText(event.target.value)}
            placeholder="Descreva a denúncia para a administração"
            className="thin-gray-scrollbar min-h-32 resize-none bg-muted"
          />

          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button
              variant="ghost"
              onClick={() => handleReportDialogOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmitReport} disabled={!reportText.trim()}>
              Enviar denúncia
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingMessage)}
        onOpenChange={handleEditDialogOpenChange}
      >
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <div className="flex h-14 items-center gap-3 px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEditDialogOpenChange(false)}
              aria-label="Fechar edição"
            >
              <X className="h-5 w-5" />
            </Button>
            <DialogTitle>Editar mensagem</DialogTitle>
            <DialogDescription className="sr-only">
              Edite o texto da mensagem selecionada.
            </DialogDescription>
          </div>

          <div className="flex min-h-44 items-center justify-center bg-background/70 px-6 py-8">
            <div className="max-w-[80%] rounded-lg rounded-br-sm bg-chat-outgoing px-3 py-2 shadow-sm">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                {editValue || editingMessage?.content}
              </p>
              <div className="mt-1 flex items-center justify-end gap-1">
                {editingMessage?.isEdited && (
                  <span className="text-[10px] text-muted-foreground">
                    Editada
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {editingMessage ? formatTime(editingMessage.timestamp) : ""}
                </span>
                <MessageStatusIcon status={editingMessage?.status ?? "sent"} />
              </div>
            </div>
          </div>

          {editingMessage && !canEditMessage(editingMessage) && (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              O prazo de 15 minutos para editar esta mensagem expirou.
            </p>
          )}

          <div className="flex items-end gap-3 border-t bg-card px-4 py-3">
            <Textarea
              autoFocus
              value={editValue}
              disabled={editingMessage ? !canEditMessage(editingMessage) : true}
              onChange={(event) => setEditValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSaveEditedMessage();
                }
              }}
              rows={1}
              className="thin-gray-scrollbar min-h-12 flex-1 resize-none border-0 border-b border-primary bg-transparent px-0 py-3 text-base shadow-none focus-visible:ring-0"
            />
            <EmojiPickerButton
              onSelectEmoji={(emoji) =>
                setEditValue((currentValue) => `${currentValue}${emoji}`)
              }
            />
            <Button
              size="icon"
              className="h-12 w-12 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSaveEditedMessage}
              disabled={
                !editValue.trim() ||
                (editingMessage ? !canEditMessage(editingMessage) : true)
              }
              aria-label="Salvar edição"
            >
              <Check className="h-6 w-6" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setIsDeleteConfirmOpen(false);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogTitle className="text-xl">
            Deseja apagar{" "}
            {selectedDeleteMessages.length > 1 ? "as mensagens" : "a mensagem"}?
          </DialogTitle>
          <DialogDescription className="sr-only">
            Escolha se deseja apagar a seleção apenas para você ou para todos.
          </DialogDescription>

          <div className="mt-8 flex flex-col items-end gap-3">
            {canDeleteSelectedForEveryone && (
              <Button
                variant="outline"
                className="min-w-40 rounded-full text-primary"
                onClick={handleDeleteSelectedForEveryone}
              >
                Apagar para todos
              </Button>
            )}
            <Button
              variant="outline"
              className="min-w-40 rounded-full text-primary"
              onClick={handleDeleteSelectedForMe}
            >
              Apagar para mim
            </Button>
            <Button
              variant="outline"
              className="min-w-32 rounded-full text-primary"
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCancelRecordingConfirmOpen && isRecordingAudio}
        onOpenChange={(open) => {
          if (!open) setIsCancelRecordingConfirmOpen(false);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogTitle className="text-xl">
            Deseja apagar esta gravação?
          </DialogTitle>
          <DialogDescription className="sr-only">
            Confirme se deseja descartar o áudio gravado.
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            O áudio gravado será descartado e não poderá ser enviado.
          </p>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              className="rounded-full text-primary"
              onClick={() => setIsCancelRecordingConfirmOpen(false)}
            >
              Continuar gravando
            </Button>
            <Button
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancelAudioRecording}
            >
              Apagar áudio
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {activeCall && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 p-3 text-foreground backdrop-blur-sm sm:p-4">
          <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl md:h-[min(44rem,calc(100vh-2rem))]">
            <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-10 w-10 ring-1 ring-border">
                  <AvatarImage src={contact.avatar} alt={contact.name} />
                  <AvatarFallback>
                    {contact.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{contact.name}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {activeCallTitle} • {activeCallStatusLabel}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {activeCall.status === "failed"
                  ? "--:--"
                  : formatCallDuration(callElapsedSeconds)}
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#111312] text-white">
              {activeCall.kind === "video" &&
              activeCall.status === "active" &&
              isCallCameraEnabled ? (
                <video
                  ref={callVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-4 px-6 text-center">
                  <div className="relative">
                    <Avatar className="h-28 w-28 ring-4 ring-white/10 sm:h-36 sm:w-36">
                      <AvatarImage src={contact.avatar} alt={contact.name} />
                      <AvatarFallback className="text-3xl">
                        {contact.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {activeCall.status === "starting" && (
                      <span className="absolute inset-0 animate-ping rounded-full border border-white/30" />
                    )}
                  </div>
                  <div>
                    <div className="text-xl font-semibold sm:text-2xl">
                      {contact.name}
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {activeCall.status === "failed"
                        ? activeCall.errorMessage
                        : activeCall.kind === "video"
                          ? isCallCameraEnabled
                            ? "Preparando camera"
                            : "Camera desligada"
                          : "Chamando pelo audio"}
                    </div>
                  </div>
                </div>
              )}

              {activeCall.kind === "video" && activeCall.status === "active" && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-md bg-black/55 px-3 py-2 text-xs font-medium text-white shadow-lg">
                  {isCallCameraEnabled ? (
                    <Video className="h-4 w-4" />
                  ) : (
                    <VideoOff className="h-4 w-4" />
                  )}
                  {isCallCameraEnabled ? "Camera ligada" : "Camera desligada"}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-center gap-3 border-t bg-[#111312] px-4 py-4 text-white">
              {activeCall.status === "failed" ? (
                <>
                  <Button
                    variant="ghost"
                    className="rounded-full bg-white/10 px-5 text-white hover:bg-white/15 hover:text-white"
                    onClick={handleRetryCall}
                  >
                    Tentar novamente
                  </Button>
                  <Button
                    size="icon-lg"
                    className="h-12 w-12 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleEndCall}
                    aria-label="Fechar chamada"
                    title="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className={cn(
                      "h-12 w-12 rounded-full text-white hover:bg-white/15 hover:text-white",
                      isCallMuted ? "bg-white text-[#111312]" : "bg-white/10",
                    )}
                    onClick={handleToggleCallMuted}
                    aria-label={
                      isCallMuted ? "Ativar microfone" : "Silenciar microfone"
                    }
                    title={
                      isCallMuted ? "Ativar microfone" : "Silenciar microfone"
                    }
                  >
                    {isCallMuted ? (
                      <MicOff className="h-5 w-5" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </Button>

                  {activeCall.kind === "video" && (
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className={cn(
                        "h-12 w-12 rounded-full text-white hover:bg-white/15 hover:text-white",
                        isCallCameraEnabled
                          ? "bg-white/10"
                          : "bg-white text-[#111312]",
                      )}
                      onClick={handleToggleCallCamera}
                      aria-label={
                        isCallCameraEnabled
                          ? "Desligar camera"
                          : "Ligar camera"
                      }
                      title={
                        isCallCameraEnabled
                          ? "Desligar camera"
                          : "Ligar camera"
                      }
                    >
                      {isCallCameraEnabled ? (
                        <Video className="h-5 w-5" />
                      ) : (
                        <VideoOff className="h-5 w-5" />
                      )}
                    </Button>
                  )}

                  <Button
                    size="icon-lg"
                    className="h-14 w-14 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleEndCall}
                    aria-label="Encerrar chamada"
                    title="Encerrar chamada"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {mediaViewerMessage &&
        (mediaViewerAttachment?.type === "image" ||
          mediaViewerAttachment?.type === "video") && (
          <TooltipProvider>
            <div className="fixed inset-0 z-[80] flex flex-col bg-[#111312] text-white">
              <div className="relative z-20 flex h-14 shrink-0 items-center gap-2 bg-[#111312]/95 px-2 sm:h-16 sm:gap-4 sm:px-4 md:px-8">
                <div className="flex min-w-0 shrink-0 items-center gap-3">
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
                    <AvatarImage
                      src={getMessageSenderAvatar(mediaViewerMessage)}
                      alt={getMessageSenderName(mediaViewerMessage)}
                    />
                    <AvatarFallback>
                      {getMessageSenderName(mediaViewerMessage)
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden min-w-0 sm:block">
                    <div className="truncate text-sm font-semibold">
                      {getMessageSenderName(mediaViewerMessage)}
                    </div>
                    <div className="truncate text-xs text-white/70">
                      {formatMediaDate(mediaViewerMessage.timestamp)} às{" "}
                      {formatTime(mediaViewerMessage.timestamp)}
                    </div>
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
                  <div className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain">
                    <MediaToolbarButton disabled icon={Search} label="Buscar" />
                    <MediaToolbarButton
                      icon={ZoomOut}
                      label="Menos zoom"
                      onClick={() =>
                        setMediaZoom((zoom) => Math.max(0.7, zoom - 0.25))
                      }
                    />
                    <MediaToolbarButton
                      icon={ZoomIn}
                      label="Mais zoom"
                      onClick={() =>
                        setMediaZoom((zoom) => Math.min(2.5, zoom + 0.25))
                      }
                    />
                    <MediaToolbarButton
                      icon={PanelTop}
                      label="Detalhes"
                      onClick={onShowContactDetails}
                    />
                    <MediaToolbarButton
                      icon={Reply}
                      label="Responder"
                      onClick={() =>
                        handleReplyFromMediaViewer(mediaViewerMessage)
                      }
                    />
                    <MediaToolbarButton
                      active={isMessageFavoriteForUser(
                        mediaViewerMessage,
                        currentUser.id,
                      )}
                      icon={Star}
                      label={
                        isMessageFavoriteForUser(
                          mediaViewerMessage,
                          currentUser.id,
                        )
                          ? "Desfavoritar"
                          : "Favoritar"
                      }
                      onClick={() =>
                        handleToggleFavoriteMessage(mediaViewerMessage)
                      }
                    />
                    <MediaToolbarButton
                      active={isMessagePinnedForUser(
                        mediaViewerMessage,
                        currentUser.id,
                      )}
                      disabled={mediaViewerPinDisabled}
                      icon={Pin}
                      label={
                        isMessagePinnedForUser(
                          mediaViewerMessage,
                          currentUser.id,
                        )
                          ? "Desfixar"
                          : "Fixar"
                      }
                      onClick={() => handleTogglePinMessage(mediaViewerMessage)}
                    />
                    <MediaToolbarButton
                      icon={Forward}
                      label="Encaminhar"
                      onClick={() =>
                        handleForwardFromMediaViewer(mediaViewerMessage)
                      }
                    />
                    <MediaToolbarButton
                      icon={Download}
                      label="Baixar"
                      onClick={() => handleDownloadMedia(mediaViewerMessage)}
                    />
                  </div>
                  <MediaToolbarButton
                    className="shrink-0"
                    icon={X}
                    label="Fechar"
                    onClick={handleCloseMediaViewer}
                  />
                </div>
              </div>

              <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-2 sm:px-8 sm:py-4 md:px-16">
                {mediaMessages.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 z-20 h-10 w-10 -translate-y-1/2 rounded-full bg-black/20 text-white hover:bg-white/10 hover:text-white sm:left-5 sm:h-12 sm:w-12"
                      onClick={() => handleNavigateMediaViewer(-1)}
                      aria-label="Mídia anterior"
                    >
                      <ChevronDown className="h-5 w-5 rotate-90 sm:h-6 sm:w-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 z-20 h-10 w-10 -translate-y-1/2 rounded-full bg-black/20 text-white hover:bg-white/10 hover:text-white sm:right-5 sm:h-12 sm:w-12"
                      onClick={() => handleNavigateMediaViewer(1)}
                      aria-label="Próxima mídia"
                    >
                      <ChevronDown className="h-5 w-5 -rotate-90 sm:h-6 sm:w-6" />
                    </Button>
                  </>
                )}

                {mediaViewerAttachment.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={mediaViewerAttachment.alt}
                    className="max-h-full max-w-full object-contain transition-transform"
                    src={mediaViewerAttachment.src}
                    style={{
                      transform: `scale(${mediaZoom})`,
                    }}
                  />
                ) : (
                  <video
                    controls
                    className="max-h-full max-w-full rounded bg-black transition-transform"
                    src={
                      mediaViewerAttachment.src ??
                      mediaViewerAttachment.thumbnail
                    }
                    style={{ transform: `scale(${mediaZoom})` }}
                  />
                )}

                {mediaViewerMessage.content && (
                  <div className="absolute bottom-2 left-1/2 z-20 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-black/35 px-4 py-2 text-center text-sm text-white/80 sm:bottom-3 sm:max-w-xl">
                    {mediaViewerMessage.content}
                  </div>
                )}
              </div>

              {mediaMessages.length > 1 && (
                <div className="thin-gray-scrollbar flex h-20 shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 px-3 py-2 sm:h-24 sm:px-4">
                  {mediaMessages.map((message) => {
                    const attachment = message.attachment;
                    const thumbSource = getMediaThumbSource(message);
                    const isActive = message.id === mediaViewerMessage.id;

                    if (
                      attachment?.type !== "image" &&
                      attachment?.type !== "video"
                    ) {
                      return null;
                    }

                    return (
                      <button
                        key={`media-thumb-${message.id}`}
                        type="button"
                        className={cn(
                          "relative h-14 w-14 shrink-0 overflow-hidden rounded border-2 bg-white/10 transition-colors sm:h-16 sm:w-16",
                          isActive ? "border-primary" : "border-transparent",
                        )}
                        onClick={() =>
                          handleSelectMediaViewerMessage(message.id)
                        }
                        aria-label={`Abrir ${getMessageSnippet(message)}`}
                      >
                        <span
                          aria-hidden="true"
                          className="block h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${thumbSource})` }}
                        />
                        {attachment.type === "video" && (
                          <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white">
                            <Play className="h-2.5 w-2.5 fill-white" />
                            {attachment.duration}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </TooltipProvider>
        )}

      {isAttachmentComposerOpen ? (
        <AttachmentComposer
          attachments={pendingAttachments}
          activeAttachmentId={
            activePendingAttachmentId ?? pendingAttachments[0]?.id ?? ""
          }
          caption={attachmentCaption}
          onCaptionChange={setAttachmentCaption}
          onSelectAttachment={setActivePendingAttachmentId}
          onRemoveAttachment={handleRemovePendingAttachment}
          onAddMore={openAttachmentPicker}
          onClose={handleCloseAttachmentComposer}
          onSend={handleSendAttachments}
        />
      ) : (
        <>
          {activePinnedMessage && (
            <button
              type="button"
              className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 text-left transition-colors hover:bg-muted/40"
              onClick={handlePinnedMessageBarClick}
            >
              <div className="flex h-7 w-2 shrink-0 flex-col justify-center gap-1">
                {pinnedMessages.map((message, index) => (
                  <span
                    key={`pinned-indicator-${message.id}`}
                    className={cn(
                      "h-1.5 w-0.5 rounded-full",
                      index === activePinnedMessageIndex
                        ? "bg-primary"
                        : "bg-muted-foreground/50",
                    )}
                  />
                ))}
              </div>
              <Pin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {getMessageSnippet(activePinnedMessage)}
              </span>
            </button>
          )}

          {/* Messages */}
          <div className="relative min-h-0 flex-1">
            <div
              className="thin-gray-scrollbar h-full overflow-y-auto bg-muted/20 px-3 py-4 md:px-5"
              ref={scrollRef}
              onScroll={handleMessagesScroll}
            >
              <div className="flex min-h-full flex-col gap-1">
                {visibleMessages.length === 0 && (
                  <div className="flex min-h-full items-center justify-center px-4 py-12 text-center">
                    <div className="max-w-sm rounded-lg border bg-card/80 px-5 py-4 shadow-sm">
                      <p className="font-medium text-foreground">
                        {isGroup
                          ? "Este grupo ainda não tem mensagens."
                          : `Você não tem conversa com ${contact.name}.`}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {isGroup
                          ? "Envie a primeira mensagem no grupo."
                          : "Inicie uma conversa enviando a primeira mensagem."}
                      </p>
                    </div>
                  </div>
                )}

                {visibleMessageItems.map((item) => {
                  if (item.type === "date") {
                    return (
                      <div key={item.id} className="flex justify-center py-3">
                        <span className="rounded-lg border bg-card/85 px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm">
                          {formatMessageDateSeparator(item.date)}
                        </span>
                      </div>
                    );
                  }

                  const { message } = item;
                  const ownMessage = isMessageOwn(message);
                  const senderName = getMessageSenderName(message);
                  const senderAvatar = getMessageSenderAvatar(message);

                  return (
                    <ContextMenu key={message.id}>
                      <ContextMenuTrigger>
                        <div
                          ref={(element) => {
                            messageRefs.current[message.id] = element;
                          }}
                          className={cn(
                            "group flex scroll-mt-24 select-none items-center gap-3",
                            isDeleteSelectionMode
                              ? "justify-start"
                              : ownMessage
                                ? "justify-end"
                                : "justify-start",
                          )}
                          onClick={(event) => {
                            if (isDeleteSelectionMode) {
                              event.preventDefault();
                              event.stopPropagation();
                              handleToggleDeleteSelection(message.id);
                              return;
                            }

                            handleMessageClick(event);
                          }}
                          onContextMenu={(event) => {
                            if (
                              typeof window !== "undefined" &&
                              window.matchMedia("(max-width: 767px)").matches
                            ) {
                              event.preventDefault();
                              event.stopPropagation();
                            }
                          }}
                          onTouchCancel={handleMessageTouchEnd}
                          onTouchEnd={handleMessageTouchEnd}
                          onTouchMove={cancelMessageLongPress}
                          onTouchStart={() => {
                            if (!isDeleteSelectionMode) {
                              handleMessageLongPressStart(message.id);
                            }
                          }}
                        >
                          {isDeleteSelectionMode && (
                            <Checkbox
                              checked={selectedDeleteMessageIds.includes(
                                message.id,
                              )}
                              onCheckedChange={() =>
                                handleToggleDeleteSelection(message.id)
                              }
                              onClick={(event) => event.stopPropagation()}
                              aria-label="Selecionar mensagem"
                            />
                          )}
                          <div
                            className={cn(
                              "flex min-w-0 flex-1",
                              ownMessage ? "justify-end" : "justify-start",
                            )}
                          >
                            <div
                              className={cn(
                                "relative max-w-[min(78%,32rem)] rounded-xl px-3 py-2 shadow-sm transition-[box-shadow,background-color,transform] md:max-w-[min(62%,34rem)]",
                                ownMessage
                                  ? "rounded-br-sm bg-chat-outgoing text-foreground"
                                  : "rounded-bl-sm bg-chat-incoming text-foreground",
                                highlightedMessageId === message.id &&
                                  "ring-2 ring-primary/70",
                                activeLongPressMessageId === message.id &&
                                  (openMessageMenuId === message.id
                                    ? "long-press-selected"
                                    : "long-press-selecting"),
                              )}
                            >
                              {message.deletedForEveryone ? (
                                <div className="flex items-center gap-2 pr-2 text-sm italic text-muted-foreground">
                                  <Ban className="h-4 w-4" />
                                  Mensagem apagada
                                </div>
                              ) : (
                                <>
                                  {isGroup && (
                                    <div
                                      className={cn(
                                        "mb-1 pr-7 text-xs font-semibold",
                                        ownMessage
                                          ? "text-primary"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {senderName}
                                    </div>
                                  )}

                                  {message.isForwarded && (
                                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                      <Forward className="h-3.5 w-3.5" />
                                      Encaminhada
                                    </div>
                                  )}

                                  {message.replyTo && (
                                    <div
                                      className={cn(
                                        "mb-1 rounded border-l-2 px-2 py-1 text-xs",
                                        ownMessage
                                          ? "border-primary/50 bg-primary/10"
                                          : "border-muted-foreground/50 bg-muted/50",
                                      )}
                                    >
                                      <span className="font-medium text-primary">
                                        {message.replyTo.senderName}
                                      </span>
                                      <p className="truncate text-muted-foreground">
                                        {message.replyTo.content}
                                      </p>
                                    </div>
                                  )}

                                  {message.isPriority && (
                                    <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Prioritária
                                    </div>
                                  )}

                                  <MessageAttachmentPreview
                                    isOwnMessage={ownMessage}
                                    message={message}
                                    onOpenMediaViewer={handleOpenMediaViewer}
                                    senderAvatar={senderAvatar}
                                    senderName={senderName}
                                  />

                                  <MessageText message={message} />
                                </>
                              )}

                              <div className="mt-1 flex items-center justify-end gap-2">
                                <div className="ml-auto flex items-center gap-1">
                                  {isMessageFavoriteForUser(
                                    message,
                                    currentUser.id,
                                  ) && (
                                    <Star className="h-3.5 w-3.5 fill-current text-muted-foreground" />
                                  )}
                                  {isMessagePinnedForUser(
                                    message,
                                    currentUser.id,
                                  ) && (
                                    <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                  {message.isEdited &&
                                    !message.deletedForEveryone && (
                                      <span className="text-[10px] text-muted-foreground">
                                        Editada
                                      </span>
                                    )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatTime(message.timestamp)}
                                  </span>
                                  {ownMessage && (
                                    <MessageStatusIcon
                                      status={message.status}
                                    />
                                  )}
                                </div>
                              </div>

                              {/* Dropdown for hover actions */}
                              {!isDeleteSelectionMode && (
                                <DropdownMenu
                                  open={openMessageMenuId === message.id}
                                  onOpenChange={(open) => {
                                    setOpenMessageMenuId(
                                      open ? message.id : null,
                                    );

                                    if (
                                      !open &&
                                      activeLongPressMessageId === message.id
                                    ) {
                                      setActiveLongPressMessageId(null);
                                    }
                                  }}
                                >
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      className={cn(
                                        "absolute right-1 top-1 size-0 overflow-hidden p-0 opacity-0 md:size-6 md:transition-opacity md:group-hover:opacity-100",
                                        openMessageMenuId === message.id &&
                                          "md:opacity-100",
                                        "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20",
                                      )}
                                      aria-label="Abrir opções da mensagem"
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                    >
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="min-w-[140px]"
                                  >
                                    {getMessageActions(message).map(
                                      (action) => {
                                        const ActionIcon = action.icon;

                                        return (
                                          <DropdownMenuItem
                                            key={action.id}
                                            disabled={action.disabled}
                                            onClick={action.onSelect}
                                          >
                                            <ActionIcon className="mr-2 h-4 w-4" />
                                            {action.label}
                                          </DropdownMenuItem>
                                        );
                                      },
                                    )}
                                    {canEditMessage(message) && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleOpenEditDialog(message)
                                        }
                                      >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Editar
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() =>
                                        handleStartDeleteSelection(message.id)
                                      }
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Apagar
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        {!isDeleteSelectionMode && (
                          <>
                            {getMessageActions(message).map((action) => {
                              const ActionIcon = action.icon;

                              return (
                                <ContextMenuItem
                                  key={action.id}
                                  disabled={action.disabled}
                                  onClick={action.onSelect}
                                >
                                  <ActionIcon className="mr-2 h-4 w-4" />
                                  {action.label}
                                </ContextMenuItem>
                              );
                            })}
                            {canEditMessage(message) && (
                              <ContextMenuItem
                                onClick={() => handleOpenEditDialog(message)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </ContextMenuItem>
                            )}
                            <ContextMenuSeparator />
                          </>
                        )}
                        <ContextMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleStartDeleteSelection(message.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Apagar
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            </div>
            {showScrollToLatest && (
              <Button
                type="button"
                size="icon"
                className="absolute bottom-4 right-4 z-20 h-10 w-10 rounded-full bg-card text-foreground shadow-lg ring-1 ring-border hover:bg-muted"
                onClick={handleScrollToLatestMessage}
                aria-label="Ir para mensagem mais recente"
                title="Ir para mensagem mais recente"
              >
                <ChevronDown className="h-5 w-5" />
              </Button>
            )}
          </div>

          {isDeleteSelectionMode ? (
            <div className="flex shrink-0 items-center gap-3 border-t bg-background px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancelDeleteSelection}
                aria-label="Cancelar seleção"
              >
                <X className="h-5 w-5" />
              </Button>
              <span className="flex-1 font-medium">
                {selectedDeleteMessageIds.length} selecionada
                {selectedDeleteMessageIds.length === 1 ? "" : "s"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-foreground"
                disabled={selectedDeleteMessageIds.length === 0}
                onClick={() => setIsDeleteConfirmOpen(true)}
                aria-label="Apagar mensagens selecionadas"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <>
              {/* Reply Preview */}
              {replyingTo && (
                <div className="flex shrink-0 items-center gap-2 border-t bg-background px-4 py-2">
                  <div className="flex-1 rounded border-l-2 border-primary bg-muted/50 px-3 py-2">
                    <span className="text-xs font-medium text-primary">
                      {getMessageSenderName(replyingTo)}
                    </span>
                    <p className="truncate text-sm text-muted-foreground">
                      {replyingTo.content}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setReplyingTo(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Input Area */}
              {isRecordingAudio ? (
                <div className="flex shrink-0 items-center gap-3 border-t bg-background px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:px-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setIsCancelRecordingConfirmOpen(true)}
                    aria-label="Apagar gravação"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                  <div className="ml-auto flex min-w-0 flex-1 justify-end">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                      <span className="w-12 shrink-0 text-lg font-semibold tabular-nums">
                        {formatRecordingTime(recordingSeconds)}
                      </span>
                      <div className="flex h-8 w-28 min-w-0 items-center gap-0.5 overflow-hidden sm:w-44 md:w-56">
                        {liveRecordingWaveform.map((height, index) => (
                          <span
                            key={`recording-wave-${index}`}
                            className="w-1 shrink-0 rounded-full bg-muted-foreground/80 transition-[height] duration-75"
                            style={{ height: `${height}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-primary"
                    onClick={handleToggleRecordingPaused}
                    aria-label={
                      isRecordingPaused
                        ? "Continuar gravação"
                        : "Pausar gravação"
                    }
                  >
                    {isRecordingPaused ? (
                      <Play className="h-5 w-5 fill-current" />
                    ) : (
                      <Pause className="h-5 w-5 fill-current" />
                    )}
                  </Button>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isPriority}
                    aria-label="Mensagem prioritária"
                    title="Mensagem prioritária"
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      isPriority &&
                        "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                    )}
                    onClick={() => setIsPriority((current) => !current)}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border border-muted-foreground/70",
                        isPriority &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {isPriority && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                  <Button
                    size="icon"
                    className="h-12 w-12 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={handleSendAudioRecording}
                    disabled={isSendingAudioRecording}
                    aria-label="Enviar áudio"
                  >
                    <Send className="h-6 w-6" />
                  </Button>
                </div>
              ) : (
                <div className="flex shrink-0 items-end gap-2 border-t bg-background px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:px-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mb-0.5 text-muted-foreground sm:hidden"
                        aria-label="Abrir opções de mensagem"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="min-w-[170px]"
                    >
                      <DropdownMenuItem
                        className="gap-3"
                        onSelect={(event) => {
                          event.preventDefault();
                          setIsPriority((current) => !current);
                        }}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border border-muted-foreground/70",
                            isPriority &&
                              "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {isPriority && <Check className="h-3 w-3" />}
                        </span>
                        Prioritária
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isUploadingAttachment}
                        onClick={openAttachmentPicker}
                      >
                        <Paperclip className="mr-2 h-4 w-4" />
                        Upload
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isPriority}
                    aria-label="Mensagem prioritária"
                    title="Mensagem prioritária"
                    className={cn(
                      "mb-0.5 hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex",
                      isPriority &&
                        "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                    )}
                    onClick={() => setIsPriority((current) => !current)}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border border-muted-foreground/70",
                        isPriority &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {isPriority && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                  <EmojiPickerButton
                    buttonClassName="mb-0.5 hidden sm:flex"
                    onSelectEmoji={handleInsertMessageEmoji}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mb-0.5 hidden text-muted-foreground sm:flex"
                    onClick={openAttachmentPicker}
                    disabled={isUploadingAttachment}
                    aria-label="Anexar arquivos"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>

                  <Textarea
                    ref={messageInputRef}
                    placeholder="Digite uma mensagem"
                    rows={1}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      onTypingChange?.(e.target.value.trim().length > 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="thin-gray-scrollbar h-10 max-h-[7.5rem] min-h-10 flex-1 resize-none rounded-md bg-muted/35 px-3 py-2 leading-5 focus-visible:ring-primary/40"
                  />

                  {inputValue.trim() ? (
                    <Button
                      size="icon"
                      className="mb-0.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={handleSendMessage}
                      aria-label="Enviar mensagem"
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mb-0.5 text-muted-foreground"
                      onClick={handleStartAudioRecording}
                      aria-label="Gravar áudio"
                    >
                      <Mic className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
