"use client";

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
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
import { Label } from "@/components/unipar-ui/label";
import { Textarea } from "@/components/unipar-ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/unipar-ui/dropdown-menu";
import {
  Search,
  Plus,
  Archive,
  BellOff,
  Check,
  CheckCheck,
  Pin,
  Trash2,
  ArrowLeft,
  Flag,
  Eraser,
  ChevronDown,
  ImageIcon,
  UserPlus,
  LogOut,
} from "lucide-react";
import {
  formatLastMessageTime,
  getChatPresenceMeta,
  type Contact,
  type DirectoryUser,
} from "@/lib/chat-data";
import { cn } from "@/lib/utils";
import {
  getUploadSizeLimitMessage,
  splitFilesByUploadSize,
} from "@/lib/upload-limits";
import { toast } from "sonner";

const DIRECTORY_PAGE_SIZE = 30;
const CONVERSATION_PAGE_SIZE = 40;
const LAST_MESSAGE_PREVIEW_LENGTH = 25;
const LONG_PRESS_DURATION_MS = 1000;

interface CreateGroupInput {
  name: string;
  avatar: string;
  description: string;
  participantIds: string[];
}

function formatLastMessagePreview(message: string) {
  if (message.length <= LAST_MESSAGE_PREVIEW_LENGTH) return message;

  return `${message.slice(0, LAST_MESSAGE_PREVIEW_LENGTH)}...`;
}

function ConversationLastMessageStatusIcon({
  status,
}: {
  status?: Contact["lastMessageStatus"];
}) {
  switch (status) {
    case "sent":
      return <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    case "delivered":
      return (
        <CheckCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      );
    case "read":
      return <CheckCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" />;
    default:
      return null;
  }
}

interface ConversationListProps {
  contacts: Contact[];
  directoryUsers: DirectoryUser[];
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact) => void;
  onStartConversation: (user: DirectoryUser) => void;
  onArchiveContact: (contactId: string) => void;
  onMuteContact: (contactId: string) => void;
  onPinContact: (contactId: string) => void;
  onReportContact: (contactId: string) => void;
  onClearContact: (contactId: string) => void;
  onLeaveGroup?: (contactId: string) => void;
  onDeleteContact: (contactId: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  archivedCount: number;
  title?: string;
  searchPlaceholder?: string;
  createMode?: "conversation" | "group";
  onCreateGroup?: (group: CreateGroupInput) => void;
}

export function ConversationList({
  contacts,
  directoryUsers,
  selectedContact,
  onSelectContact,
  onStartConversation,
  onArchiveContact,
  onMuteContact,
  onPinContact,
  onReportContact,
  onClearContact,
  onLeaveGroup,
  onDeleteContact,
  showArchived,
  onToggleArchived,
  archivedCount,
  title = "Conversas",
  searchPlaceholder = "Pesquisar ou começar uma nova conversa",
  createMode = "conversation",
  onCreateGroup,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [isParticipantPickerOpen, setIsParticipantPickerOpen] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupPhotoDataUrl, setGroupPhotoDataUrl] = useState("");
  const [selectedGroupParticipantIds, setSelectedGroupParticipantIds] =
    useState<string[]>([]);
  const [visibleDirectoryCount, setVisibleDirectoryCount] =
    useState(DIRECTORY_PAGE_SIZE);
  const [contactPagination, setContactPagination] = useState({
    count: CONVERSATION_PAGE_SIZE,
    key: "",
  });
  const [openContactMenuId, setOpenContactMenuId] = useState<string | null>(
    null,
  );
  const [activeLongPressContactId, setActiveLongPressContactId] = useState<
    string | null
  >(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);

  const filteredContacts = contacts
    .filter((contact) =>
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (a.isPinned === b.isPinned) {
        return b.lastMessageTime.getTime() - a.lastMessageTime.getTime();
      }
      return a.isPinned ? -1 : 1;
    });

  const contactPaginationKey = `${showArchived ? "archived" : "active"}:${searchQuery}:${contacts.length}`;
  const visibleContactCount =
    contactPagination.key === contactPaginationKey
      ? contactPagination.count
      : CONVERSATION_PAGE_SIZE;
  const visibleContacts = filteredContacts.slice(0, visibleContactCount);
  const hasMoreContacts = visibleContactCount < filteredContacts.length;

  const filteredDirectoryUsers = useMemo(() => {
    const normalizedQuery = directoryQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return directoryUsers;
    }

    return directoryUsers.filter((user) =>
      user.name.toLowerCase().includes(normalizedQuery),
    );
  }, [directoryQuery, directoryUsers]);

  const visibleDirectoryUsers = filteredDirectoryUsers.slice(
    0,
    visibleDirectoryCount,
  );

  const selectedGroupParticipants = useMemo(() => {
    const usersById = new Map(directoryUsers.map((user) => [user.id, user]));

    return selectedGroupParticipantIds
      .map((participantId) => usersById.get(participantId))
      .filter((user): user is DirectoryUser => user !== undefined);
  }, [directoryUsers, selectedGroupParticipantIds]);

  const hasMoreDirectoryUsers =
    visibleDirectoryCount < filteredDirectoryUsers.length;
  const isGroupMode = createMode === "group";
  const conversationLabel = isGroupMode ? "grupo" : "conversa";

  const handleDirectoryScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMoreDirectoryUsers) return;

    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 72;

    if (isNearBottom) {
      setVisibleDirectoryCount((count) =>
        Math.min(count + DIRECTORY_PAGE_SIZE, filteredDirectoryUsers.length),
      );
    }
  };

  const handleContactListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMoreContacts) return;

    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 120;

    if (isNearBottom) {
      setContactPagination((pagination) => ({
        count: Math.min(
          (pagination.key === contactPaginationKey
            ? pagination.count
            : CONVERSATION_PAGE_SIZE) + CONVERSATION_PAGE_SIZE,
          filteredContacts.length,
        ),
        key: contactPaginationKey,
      }));
    }
  };

  const handleStartConversation = (user: DirectoryUser) => {
    onStartConversation(user);
    setIsNewConversationOpen(false);
    setDirectoryQuery("");
    setVisibleDirectoryCount(DIRECTORY_PAGE_SIZE);
  };

  const resetGroupForm = () => {
    setGroupName("");
    setGroupDescription("");
    setGroupPhotoDataUrl("");
    setSelectedGroupParticipantIds([]);
  };

  const handleNewConversationOpenChange = (open: boolean) => {
    setIsNewConversationOpen(open);
    setVisibleDirectoryCount(DIRECTORY_PAGE_SIZE);

    if (!open) {
      setIsParticipantPickerOpen(false);
      setDirectoryQuery("");
      resetGroupForm();
    }
  };

  const handleParticipantPickerOpenChange = (open: boolean) => {
    setIsParticipantPickerOpen(open);
    setVisibleDirectoryCount(DIRECTORY_PAGE_SIZE);

    if (!open) {
      setDirectoryQuery("");
    }
  };

  const handleOpenParticipantPicker = () => {
    setDirectoryQuery("");
    setVisibleDirectoryCount(DIRECTORY_PAGE_SIZE);
    setIsParticipantPickerOpen(true);
  };

  const handleDirectoryQueryChange = (query: string) => {
    setDirectoryQuery(query);
    setVisibleDirectoryCount(DIRECTORY_PAGE_SIZE);
  };

  const handleGroupPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const { acceptedFiles, rejectedFiles } = splitFilesByUploadSize([file]);

    if (rejectedFiles.length > 0) {
      toast.error("Arquivo acima de 16 MB.", {
        description: getUploadSizeLimitMessage(rejectedFiles.length),
      });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setGroupPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(acceptedFiles[0]);
    event.target.value = "";
  };

  const toggleGroupParticipant = (participantId: string) => {
    setSelectedGroupParticipantIds((currentIds) =>
      currentIds.includes(participantId)
        ? currentIds.filter((currentId) => currentId !== participantId)
        : [...currentIds, participantId],
    );
  };

  const handleCreateGroup = () => {
    const normalizedName = groupName.trim();

    if (!normalizedName) {
      toast.error("Digite o nome do grupo.");
      return;
    }

    if (selectedGroupParticipantIds.length === 0) {
      toast.error("Selecione ao menos um participante.");
      return;
    }

    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      normalizedName,
    )}&background=10b981&color=fff`;

    onCreateGroup?.({
      name: normalizedName,
      avatar: groupPhotoDataUrl || fallbackAvatar,
      description: groupDescription.trim() || "Grupo interno",
      participantIds: selectedGroupParticipantIds,
    });
    setIsNewConversationOpen(false);
    setIsParticipantPickerOpen(false);
    setDirectoryQuery("");
    setVisibleDirectoryCount(DIRECTORY_PAGE_SIZE);
    resetGroupForm();
    toast.success("Grupo criado.");
  };

  const clearContactLongPress = () => {
    if (!longPressTimerRef.current) return;

    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const cancelContactLongPress = () => {
    clearContactLongPress();
    setActiveLongPressContactId(null);
  };

  const handleContactLongPressStart = (contactId: string) => {
    clearContactLongPress();
    setActiveLongPressContactId(contactId);
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setOpenContactMenuId(contactId);
    }, LONG_PRESS_DURATION_MS);
  };

  const handleContactTouchEnd = () => {
    clearContactLongPress();

    if (longPressTriggeredRef.current) {
      setTimeout(() => {
        longPressTriggeredRef.current = false;
      }, 350);
      return;
    }

    setActiveLongPressContactId(null);
  };

  const handleContactClick = (
    event: MouseEvent<HTMLDivElement>,
    contact: Contact,
  ) => {
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggeredRef.current = false;
      return;
    }

    onSelectContact(contact);
  };

  const handleContactContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    contactId: string,
  ) => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      event.preventDefault();

      if (longPressTriggeredRef.current) {
        setOpenContactMenuId(contactId);
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b bg-background px-3">
        {showArchived ? (
          <>
            <Button variant="ghost" size="icon" onClick={onToggleArchived}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 text-center">
              <h1 className="truncate text-base font-semibold text-foreground">
                Arquivadas
              </h1>
              <p className="text-xs text-muted-foreground">
                {filteredContacts.length}{" "}
                {isGroupMode
                  ? filteredContacts.length === 1
                    ? "grupo"
                    : "grupos"
                  : filteredContacts.length === 1
                    ? "conversa"
                    : "conversas"}
              </p>
            </div>
            <div className="w-10" />
          </>
        ) : (
          <>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-base font-semibold text-foreground">
                  {title}
                </h1>
                {filteredContacts.length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                    {filteredContacts.length}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {isGroupMode ? "Conversas em equipe" : "Mensagens internas"}
              </p>
            </div>
            <Button
              size="icon"
              className="h-8 w-8 rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              onClick={() => setIsNewConversationOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">
                {createMode === "group" ? "Criar grupo" : "Nova conversa"}
              </span>
            </Button>
          </>
        )}
      </div>

      <Dialog
        open={isNewConversationOpen}
        onOpenChange={handleNewConversationOpenChange}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>
              {createMode === "group" ? "Criar grupo" : "Nova conversa"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {createMode === "group"
                ? "Preencha os dados e escolha participantes para criar um grupo."
                : "Escolha um usuário para iniciar uma conversa."}
            </DialogDescription>
          </DialogHeader>

          {createMode === "group" && (
            <div className="grid gap-4 border-b bg-card p-4">
              <input
                ref={groupPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleGroupPhotoChange}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground"
                  onClick={() => groupPhotoInputRef.current?.click()}
                  aria-label="Selecionar foto do grupo"
                >
                  {groupPhotoDataUrl ? (
                    <span
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${groupPhotoDataUrl})` }}
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6" />
                  )}
                </button>
                <div className="grid min-w-0 flex-1 gap-2">
                  <Label htmlFor="group-name">Nome do grupo</Label>
                  <Input
                    id="group-name"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Digite o nome do grupo"
                    className="bg-muted"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="group-description">Descrição do grupo</Label>
                <Textarea
                  id="group-description"
                  value={groupDescription}
                  onChange={(event) => setGroupDescription(event.target.value)}
                  placeholder="Digite uma descrição"
                  className="min-h-20 resize-none bg-muted"
                />
              </div>
            </div>
          )}

          {createMode === "group" && (
            <div className="grid gap-3 border-b bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Participantes
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedGroupParticipantIds.length} participante
                    {selectedGroupParticipantIds.length === 1 ? "" : "s"}{" "}
                    selecionado
                    {selectedGroupParticipantIds.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center sm:w-auto"
                  onClick={handleOpenParticipantPicker}
                >
                  <UserPlus className="h-4 w-4" />
                  Adicionar participantes
                </Button>
              </div>
              {selectedGroupParticipants.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedGroupParticipants.slice(0, 4).map((user) => (
                    <div
                      key={user.id}
                      className="flex max-w-full items-center gap-2 rounded-full bg-muted px-2 py-1 text-sm"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback>
                          {user.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="max-w-32 truncate">{user.name}</span>
                    </div>
                  ))}
                  {selectedGroupParticipants.length > 4 && (
                    <div className="flex h-8 items-center rounded-full bg-muted px-3 text-sm text-muted-foreground">
                      +{selectedGroupParticipants.length - 4}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {createMode === "conversation" && (
            <div className="border-b bg-card p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Buscar por nome"
                  value={directoryQuery}
                  onChange={(event) =>
                    handleDirectoryQueryChange(event.target.value)
                  }
                  className="bg-muted pl-10"
                />
              </div>
            </div>
          )}

          {createMode === "conversation" && (
            <div
              className="thin-gray-scrollbar max-h-[min(40rem,calc(100vh-14rem))] overflow-y-auto overscroll-contain"
              onScroll={handleDirectoryScroll}
            >
              <div className="divide-y">
                {visibleDirectoryUsers.map((user) => (
                  <button
                    key={user.id}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    onClick={() => handleStartConversation(user)}
                  >
                    <div className="relative">
                      <Avatar className="h-11 w-11">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback>
                          {user.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-popover",
                          getChatPresenceMeta(user).dotClassName,
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">
                        {user.name}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {user.email}
                      </div>
                    </div>
                  </button>
                ))}

                {filteredDirectoryUsers.length === 0 && (
                  <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    Nenhum usuário encontrado
                  </div>
                )}
              </div>
            </div>
          )}
          {createMode === "group" && (
            <div className="flex items-center justify-end gap-3 border-t bg-card px-4 py-3">
              <Button onClick={handleCreateGroup}>Criar grupo</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {createMode === "group" && (
        <Dialog
          open={isParticipantPickerOpen}
          onOpenChange={handleParticipantPickerOpenChange}
        >
          <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle>Adicionar participantes</DialogTitle>
              <DialogDescription className="sr-only">
                Selecione os usuários que participarão do grupo.
              </DialogDescription>
            </DialogHeader>

            <div className="border-b bg-card p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Buscar participantes"
                  value={directoryQuery}
                  onChange={(event) =>
                    handleDirectoryQueryChange(event.target.value)
                  }
                  className="bg-muted pl-10"
                />
              </div>
            </div>

            <div
              className="thin-gray-scrollbar max-h-[min(32rem,calc(100vh-14rem))] overflow-y-auto overscroll-contain"
              onScroll={handleDirectoryScroll}
            >
              <div className="divide-y">
                {visibleDirectoryUsers.map((user) => {
                  const isSelected = selectedGroupParticipantIds.includes(
                    user.id,
                  );

                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      key={user.id}
                      className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                      onClick={() => toggleGroupParticipant(user.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleGroupParticipant(user.id);
                        }
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleGroupParticipant(user.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Selecionar ${user.name}`}
                      />
                      <div className="relative">
                        <Avatar className="h-11 w-11">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback>
                            {user.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-popover",
                            getChatPresenceMeta(user).dotClassName,
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">
                          {user.name}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredDirectoryUsers.length === 0 && (
                  <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    Nenhum usuário encontrado
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {selectedGroupParticipantIds.length} selecionado
                {selectedGroupParticipantIds.length === 1 ? "" : "s"}
              </p>
              <Button onClick={() => handleParticipantPickerOpenChange(false)}>
                Concluir
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Search */}
      <div className="border-b bg-muted/30 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 rounded-md bg-background pl-10"
          />
        </div>
      </div>

      {/* Archived Button */}
      {!showArchived && archivedCount > 0 && (
        <button
          onClick={onToggleArchived}
          className="flex items-center gap-3 border-b bg-background px-3 py-3 text-left transition-colors hover:bg-muted/35"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <Archive className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-foreground">Arquivadas</span>
            <span className="text-sm text-muted-foreground">
              {archivedCount}{" "}
              {isGroupMode
                ? archivedCount === 1
                  ? "grupo"
                  : "grupos"
                : archivedCount === 1
                  ? "conversa"
                  : "conversas"}
            </span>
          </div>
        </button>
      )}

      {/* Contact List */}
      <div
        className="thin-gray-scrollbar scrollbar-gutter-auto min-h-0 flex-1 overflow-y-auto"
        onScroll={handleContactListScroll}
      >
        <div className="divide-y">
          {visibleContacts.map((contact) => (
            <div
              key={contact.id}
              className={cn(
                "group flex cursor-pointer select-none items-center gap-3 px-3 py-3 transition-[background-color,box-shadow,transform] hover:bg-muted/35",
                selectedContact?.id === contact.id &&
                  "shadow-[inset_3px_0_0_var(--primary)]",
                activeLongPressContactId === contact.id &&
                  (openContactMenuId === contact.id
                    ? "long-press-selected"
                    : "long-press-selecting"),
              )}
              onClick={(event) => handleContactClick(event, contact)}
              onContextMenu={(event) =>
                handleContactContextMenu(event, contact.id)
              }
              onTouchCancel={handleContactTouchEnd}
              onTouchEnd={handleContactTouchEnd}
              onTouchMove={cancelContactLongPress}
              onTouchStart={() => handleContactLongPressStart(contact.id)}
            >
              <div className="relative">
                <Avatar className="h-12 w-12 ring-1 ring-border">
                  <AvatarImage src={contact.avatar} alt={contact.name} />
                  <AvatarFallback>
                    {contact.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {!isGroupMode && (
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
                      getChatPresenceMeta(contact).dotClassName,
                    )}
                  />
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">
                    {contact.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      contact.unreadCount > 0
                        ? "text-primary font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {formatLastMessageTime(contact.lastMessageTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                    {contact.isTyping ? (
                      <span className="truncate italic text-primary">
                        {contact.typingText ?? "digitando..."}
                      </span>
                    ) : (
                      <>
                        {contact.lastMessageIsOwn && (
                          <ConversationLastMessageStatusIcon
                            status={contact.lastMessageStatus}
                          />
                        )}
                        <span className="truncate">
                          {formatLastMessagePreview(contact.lastMessage)}
                        </span>
                      </>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    {contact.isPinned && (
                      <Pin className="h-4 w-4 text-muted-foreground" />
                    )}
                    {contact.isMuted && (
                      <BellOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    {contact.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                        {contact.unreadCount}
                      </span>
                    )}
                    <DropdownMenu
                      open={openContactMenuId === contact.id}
                      onOpenChange={(open) => {
                        setOpenContactMenuId(open ? contact.id : null);

                        if (!open && activeLongPressContactId === contact.id) {
                          setActiveLongPressContactId(null);
                        }
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className={cn(
                            "size-0 overflow-hidden p-0 text-muted-foreground opacity-0 md:h-6 md:w-0 md:transition-[width,opacity] md:duration-150 md:focus-visible:w-6 md:focus-visible:opacity-100",
                            openContactMenuId === contact.id
                              ? "md:w-6 md:opacity-100"
                              : "md:group-hover:w-6 md:group-hover:opacity-100",
                          )}
                          aria-label={`Abrir opções do ${conversationLabel}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[180px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onClick={() => onArchiveContact(contact.id)}
                        >
                          <Archive className="mr-2 h-4 w-4 shrink-0" />
                          {showArchived ? "Desarquivar" : "Arquivar"}{" "}
                          {conversationLabel}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onClick={() => onMuteContact(contact.id)}
                        >
                          <BellOff className="mr-2 h-4 w-4 shrink-0" />
                          {contact.isMuted
                            ? isGroupMode
                              ? "Reativar grupo"
                              : "Reativar notificação"
                            : `Silenciar ${conversationLabel}`}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onClick={() => onPinContact(contact.id)}
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
                          onClick={() => onReportContact(contact.id)}
                        >
                          <Flag className="mr-2 h-4 w-4 shrink-0" />
                          Denunciar {conversationLabel}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onClick={() => onClearContact(contact.id)}
                        >
                          <Eraser className="mr-2 h-4 w-4 shrink-0" />
                          Limpar {conversationLabel}
                        </DropdownMenuItem>
                        {isGroupMode && onLeaveGroup && (
                          <DropdownMenuItem
                            className="whitespace-nowrap text-destructive focus:text-destructive"
                            onClick={() => onLeaveGroup(contact.id)}
                          >
                            <LogOut className="mr-2 h-4 w-4 shrink-0" />
                            Sair do grupo
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="whitespace-nowrap text-destructive focus:text-destructive"
                          onClick={() => onDeleteContact(contact.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                          Apagar {conversationLabel}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredContacts.length === 0 && (
            <div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center">
              <p className="text-muted-foreground">
                {showArchived
                  ? `Nenhum ${conversationLabel} arquivado`
                  : `Nenhum ${conversationLabel} encontrado`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
