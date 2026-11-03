# Rulv Chat

Modern real-time chat app inspired by malvo.eu  
Built with **Next.js 15** + **Supabase** + **Tailwind CSS**

- Email + Password Authentication  
- Private Chats & Group Chats  
- Real-time messaging  
- Typing indicators ("XY is typing...")  
- Online status  
- Image & file upload  
- Dark / Light mode  
- German + English  
- No read receipts

---

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project  
2. Wait until the database is ready  
3. Go to **Project Settings → API** and copy:
   - `Project URL`
   - `anon` public key

---

## 2. Database Setup

In the Supabase SQL Editor, run this complete schema:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  status text default 'offline',
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- Rooms (1:1 and groups)
create table public.rooms (
  id uuid default uuid_generate_v4() primary key,
  name text,
  is_group boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Room members
create table public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);

-- Messages
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  content text,
  file_url text,
  file_type text,
  created_at timestamptz default now()
);

-- Typing indicators
create table public.typing (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  updated_at timestamptz default now(),
  primary key (room_id, user_id)
);

-- Enable Realtime
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table typing;
alter publication supabase_realtime add table room_members;
alter publication supabase_realtime add table profiles;

-- RLS
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.typing enable row level security;

-- Profiles policies
create policy "Public profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Rooms policies
create policy "Users can view rooms they are member of" on rooms for select using (
  exists (select 1 from room_members where room_members.room_id = rooms.id and room_members.user_id = auth.uid())
);
create policy "Authenticated users can create rooms" on rooms for insert with check (auth.uid() = created_by);

-- Room members policies
create policy "Users can view members of their rooms" on room_members for select using (
  exists (select 1 from room_members rm where rm.room_id = room_members.room_id and rm.user_id = auth.uid())
);
create policy "Users can join rooms" on room_members for insert with check (auth.uid() = user_id);

-- Messages policies
create policy "Users can view messages in their rooms" on messages for select using (
  exists (select 1 from room_members where room_members.room_id = messages.room_id and room_members.user_id = auth.uid())
);
create policy "Users can insert messages in their rooms" on messages for insert with check (
  auth.uid() = user_id and exists (select 1 from room_members where room_members.room_id = messages.room_id and room_members.user_id = auth.uid())
);

-- Typing policies
create policy "Users can manage typing in their rooms" on typing for all using (
  exists (select 1 from room_members where room_members.room_id = typing.room_id and room_members.user_id = auth.uid())
);

-- Storage
insert into storage.buckets (id, name, public) values ('chat-files', 'chat-files', true);
create policy "Anyone can view chat files" on storage.objects for select using (bucket_id = 'chat-files');
create policy "Authenticated users can upload" on storage.objects for insert with check (bucket_id = 'chat-files' and auth.role() = 'authenticated');
```

---

## 3. Local Setup

```bash
git clone https://github.com/ss-rt-dev/rulv-chat.git
cd rulv-chat
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

```bash
npm run dev
```

Open http://localhost:3000

---

## 4. Deploy to Vercel

1. Import the repo on [vercel.com](https://vercel.com)
2. Add the two environment variables above
3. Deploy

---

Made with ❤️
