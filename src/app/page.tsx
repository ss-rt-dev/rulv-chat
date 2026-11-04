"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

const FOUNDER_EMAIL = "justin@stella-host.de";
const OFFICIAL_ROOM_NAME = "Rulv Official";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const ensureOfficialRoomAndJoin = async (userId: string) => {
    // Find or create the official Rulv room
    let { data: room } = await supabase
      .from("rooms")
      .select("id")
      .eq("name", OFFICIAL_ROOM_NAME)
      .eq("is_group", true)
      .maybeSingle();

    if (!room) {
      const { data: newRoom } = await supabase
        .from("rooms")
        .insert({
          name: OFFICIAL_ROOM_NAME,
          is_group: true,
          created_by: userId,
        })
        .select()
        .single();
      room = newRoom;
    }

    if (room) {
      // Join the official room (ignore if already member)
      await supabase.from("room_members").upsert(
        { room_id: room.id, user_id: userId },
        { onConflict: "room_id,user_id" }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (data.user) {
          // Ensure founder is marked official + everyone joins official room
          const isFounder = data.user.email?.toLowerCase() === FOUNDER_EMAIL;
          await supabase
            .from("profiles")
            .update({
              is_official: isFounder,
              role: isFounder ? "founder" : "user",
            })
            .eq("id", data.user.id);

          await ensureOfficialRoomAndJoin(data.user.id);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        if (data.user) {
          const isFounder = email.toLowerCase() === FOUNDER_EMAIL;

          await supabase.from("profiles").insert({
            id: data.user.id,
            username: username.toLowerCase().replace(/\s/g, "_"),
            display_name: username,
            is_official: isFounder,
            role: isFounder ? "founder" : "user",
          });

          // Auto-join official Rulv server
          await ensureOfficialRoomAndJoin(data.user.id);
        }
      }
      router.push("/chat");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 text-white mb-4">
            <MessageCircle size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Rulv</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Zusammen ist besser
          </p>
        </div>

        <div className="bg-white dark:bg-[#161616] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                isLogin
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                !isLogin
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="dein_name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium transition disabled:opacity-50"
            >
              {loading ? "Loading..." : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
