"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  MessageCircle,
  LogOut,
  Plus,
  Send,
  Image as ImageIcon,
  Users,
  Moon,
  Sun,
  Search,
  BadgeCheck,
} from "lucide-react";
import { useTheme } from "next-themes";
import { format } from "date-fns";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  is_official?: boolean;
  role?: string;
};

type Room = {
  id: string;
  name: string | null;
  is_group: boolean;
  created_at: string;
};

type Message = {
  id: string;
  room_id: string;
  user_id: string;
  content: string | null;
  file_url: string | null;
  file_type: string | null;
  created_at: string;
  profiles?: Profile;
};

function OfficialBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-purple-600 text-white ml-1.5">
      <BadgeCheck size={10} />
      Official
    </span>
  );
}

export default function ChatPage() {
  const supabase = createClient();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [foundUsers, setFoundUsers] = useState<Profile[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }
      setUser(user);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile(profileData);

      await supabase
        .from("profiles")
        .update({ status: "online", last_seen: new Date().toISOString() })
        .eq("id", user.id);

      setLoading(false);
    };
    getUser();

    return () => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from("profiles")
            .update({ status: "offline", last_seen: new Date().toISOString() })
            .eq("id", user.id);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadRooms = async () => {
      const { data } = await supabase
        .from("room_members")
        .select("room_id, rooms(*)")
        .eq("user_id", user.id);

      if (data) {
        const roomList = data.map((d: any) => d.rooms).filter(Boolean);
        setRooms(roomList);
        if (roomList.length > 0 && !activeRoom) {
          const official = roomList.find((r: Room) => r.name === "Rulv Official");
          setActiveRoom(official || roomList[0]);
        }
      }
    };
    loadRooms();

    const channel = supabase
      .channel("rooms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members" },
        () => loadRooms()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!activeRoom) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*, profiles(*)")
        .eq("room_id", activeRoom.id)
        .order("created_at", { ascending: true });

      setMessages(data || []);
    };
    loadMessages();

    const channel = supabase
      .channel(`messages:${activeRoom.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${activeRoom.id}`,
        },
        async (payload) => {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", payload.new.user_id)
            .single();

          setMessages((prev) => [
            ...prev,
            { ...payload.new, profiles: profileData } as Message,
          ]);
        }
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`typing:${activeRoom.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "typing",
          filter: `room_id=eq.${activeRoom.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("typing")
            .select("user_id, profiles(display_name, username)")
            .eq("room_id", activeRoom.id)
            .neq("user_id", user.id);

          const names = (data || []).map(
            (t: any) => t.profiles?.display_name || t.profiles?.username || "Someone"
          );
          setTypingUsers(names);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(typingChannel);
    };
  }, [activeRoom, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const handleTyping = useCallback(async () => {
    if (!activeRoom || !user) return;

    await supabase.from("typing").upsert({
      room_id: activeRoom.id,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(async () => {
      await supabase
        .from("typing")
        .delete()
        .eq("room_id", activeRoom.id)
        .eq("user_id", user.id);
    }, 2000);
  }, [activeRoom, user]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeRoom || !user) return;

    const content = newMessage.trim();
    setNewMessage("");

    await supabase
      .from("typing")
      .delete()
      .eq("room_id", activeRoom.id)
      .eq("user_id", user.id);

    await supabase.from("messages").insert({
      room_id: activeRoom.id,
      user_id: user.id,
      content,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeRoom || !user) return;

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("chat-files")
      .upload(fileName, file);

    if (uploadError) {
      alert("Upload failed");
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("chat-files")
      .getPublicUrl(fileName);

    await supabase.from("messages").insert({
      room_id: activeRoom.id,
      user_id: user.id,
      file_url: publicUrl,
      file_type: file.type,
      content: file.name,
    });
  };

  const createPrivateChat = async (otherUser: Profile) => {
    const { data: room } = await supabase
      .from("rooms")
      .insert({
        name: null,
        is_group: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (room) {
      await supabase.from("room_members").insert([
        { room_id: room.id, user_id: user.id },
        { room_id: room.id, user_id: otherUser.id },
      ]);
      setActiveRoom(room);
      setShowNewChat(false);
    }
  };

  const searchUsers = async (query: string) => {
    setSearchUser(query);
    if (query.length < 2) {
      setFoundUsers([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", `%${query}%`)
      .neq("id", user.id)
      .limit(8);
    setFoundUsers(data || []);
  };

  const handleLogout = async () => {
    await supabase
      .from("profiles")
      .update({ status: "offline" })
      .eq("id", user.id);
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-[#0a0a0a]">
        <div className="animate-pulse text-brand-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex dark:bg-[#0a0a0a]">
      <div className="w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-[#111]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white">
              <MessageCircle size={18} />
            </div>
            <span className="font-bold text-lg">Rulv</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => setShowNewChat(true)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition ${
                activeRoom?.id === room.id
                  ? "bg-brand-50 dark:bg-brand-950/30 border-l-2 border-brand-600"
                  : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  {room.is_group ? <Users size={18} /> : <MessageCircle size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {room.name || (room.is_group ? "Group" : "Private Chat")}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {profile && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold">
                {(profile.display_name || profile.username)?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate flex items-center">
                  {profile.display_name || profile.username}
                  {profile.is_official && <OfficialBadge />}
                </p>
                <p className="text-xs text-green-500">Online</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {activeRoom ? (
          <>
            <div className="h-16 border-b border-gray-200 dark:border-gray-800 flex items-center px-6 bg-white dark:bg-[#111]">
              <h2 className="font-semibold">
                {activeRoom.name || "Chat"}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg) => {
                const isMe = msg.user_id === user.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        isMe
                          ? "bg-brand-600 text-white rounded-br-md"
                          : "bg-gray-100 dark:bg-gray-800 rounded-bl-md"
                      }`}
                    >
                      {!isMe && (
                        <p className="text-xs font-medium text-brand-500 mb-1 flex items-center">
                          {msg.profiles?.display_name || msg.profiles?.username}
                          {msg.profiles?.is_official && <OfficialBadge />}
                        </p>
                      )}
                      {msg.file_url ? (
                        msg.file_type?.startsWith("image/") ? (
                          <img
                            src={msg.file_url}
                            alt="upload"
                            className="rounded-lg max-w-full max-h-64 object-cover"
                          />
                        ) : (
                          <a
                            href={msg.file_url}
                            target="_blank"
                            className="underline text-sm"
                          >
                            {msg.content || "File"}
                          </a>
                        )
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <p className={`text-[10px] mt-1 ${
                        isMe ? "text-white/70" : "text-gray-400"
                      }`}>
                        {format(new Date(msg.created_at), "HH:mm")}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {typingUsers.length > 0 && (
              <div className="px-6 pb-1 text-xs text-gray-500 dark:text-gray-400">
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "schreibt" : "schreiben"}...
              </div>
            )}

            <form
              onSubmit={sendMessage}
              className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] flex items-center gap-3"
            >
              <label className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                <ImageIcon size={20} />
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                placeholder="Nachricht schreiben..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="p-2.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition"
              >
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Wähle einen Chat oder starte einen neuen
          </div>
        )}
      </div>

      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161616] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">Neuen Chat starten</h3>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchUser}
                onChange={(e) => searchUsers(e.target.value)}
                placeholder="Username suchen..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {foundUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => createPrivateChat(u)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold">
                    {(u.display_name || u.username)?.[0]?.toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="font-medium flex items-center">
                      {u.display_name || u.username}
                      {u.is_official && <OfficialBadge />}
                    </p>
                    <p className="text-xs text-gray-500">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowNewChat(false)}
              className="mt-4 w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
