-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- authors table
create table if not exists public.authors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  gravatar_email text,
  avatar_url text,
  bio_md text,
  twitter text,
  youtube text,
  website text,
  facebook text,
  linkedin text,
  instagram text,
  roblox text,
  discord text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- games table
create table if not exists public.games (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  old_slugs text[] not null default '{}'::text[],
  author_id uuid references public.authors(id),
  source_url text,
  source_url_2 text,
  source_url_3 text,
  roblox_link text,
  universe_id bigint references public.roblox_universes(universe_id),
  community_link text,
  discord_link text,
  twitter_link text,
  expired_codes jsonb not null default '[]'::jsonb,
  cover_image text,
  seo_title text,
  seo_description text,
  intro_md text,
  redeem_md text,
  find_codes_md text,
  troubleshoot_md text,
  rewards_md text,
  about_game_md text,
  description_md text,
  internal_links integer not null default 0,
  interlinking_ai jsonb not null default '{}'::jsonb,
  interlinking_ai_copy_md text,
  is_published boolean not null default false,
  published_at timestamptz,
  re_rewritten_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- roblox universes table
create table if not exists public.roblox_universes (
  universe_id bigint primary key,
  root_place_id bigint not null,
  name text not null,
  display_name text,
  slug text,
  description text,
  description_source text,
  creator_id bigint,
  creator_name text,
  creator_type text,
  creator_has_verified_badge boolean,
  group_id bigint,
  group_name text,
  group_has_verified_badge boolean,
  visibility text,
  privacy_type text,
  is_active boolean,
  is_archived boolean,
  is_sponsored boolean,
  genre text,
  genre_l1 text,
  genre_l2 text,
  is_all_genre boolean,
  age_rating text,
  universe_avatar_type text,
  desktop_enabled boolean,
  mobile_enabled boolean,
  tablet_enabled boolean,
  console_enabled boolean,
  vr_enabled boolean,
  voice_chat_enabled boolean,
  price integer,
  private_server_price_robux integer,
  create_vip_servers_allowed boolean,
  studio_access_allowed boolean,
  max_players integer,
  server_size integer,
  playing bigint,
  visits bigint,
  favorites bigint,
  likes bigint,
  dislikes bigint,
  icon_url text,
  thumbnail_urls jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '{}'::jsonb,
  raw_metadata jsonb not null default '{}'::jsonb,
  raw_details jsonb not null default '{}'::jsonb,
  created_at_api timestamptz,
  updated_at_api timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_in_sort timestamptz,
  last_seen_in_search timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roblox_universes_creator on public.roblox_universes (creator_id);
create index if not exists idx_roblox_universes_slug on public.roblox_universes (lower(slug));
create index if not exists idx_roblox_universes_seen on public.roblox_universes (coalesce(last_seen_in_sort, last_seen_in_search) desc);

-- roblox groups
create table if not exists public.roblox_groups (
  group_id bigint primary key,
  name text not null,
  description text,
  member_count bigint,
  owner_id bigint,
  owner_name text,
  has_verified_badge boolean,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- roblox universe social links
create table if not exists public.roblox_universe_social_links (
  id uuid primary key default uuid_generate_v4(),
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  platform text not null,
  title text,
  url text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

create unique index if not exists idx_roblox_universe_social_links_unique on public.roblox_universe_social_links (universe_id, platform, url);

-- roblox universe media (icons, screenshots, videos)
create table if not exists public.roblox_universe_media (
  id uuid primary key default uuid_generate_v4(),
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  media_type text not null check (media_type in ('icon','screenshot','video')),
  image_url text,
  video_url text,
  alt_text text,
  is_primary boolean not null default false,
  approved boolean,
  extra jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_roblox_universe_media_universe on public.roblox_universe_media (universe_id, media_type);

-- roblox universe badges
create table if not exists public.roblox_universe_badges (
  badge_id bigint primary key,
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  name text not null,
  description text,
  icon_image_id bigint,
  icon_image_url text,
  awarding_badge_asset_id bigint,
  enabled boolean,
  awarded_count bigint,
  awarded_past_day bigint,
  awarded_past_week bigint,
  rarity_percent numeric,
  stats_updated_at timestamptz,
  created_at_api timestamptz,
  updated_at_api timestamptz,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_roblox_universe_badges on public.roblox_universe_badges (universe_id);

-- roblox universe game passes
create table if not exists public.roblox_universe_gamepasses (
  pass_id bigint primary key,
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  product_id bigint,
  name text not null,
  description text,
  price integer,
  is_for_sale boolean,
  sales bigint,
  icon_image_id bigint,
  icon_image_url text,
  created_at_api timestamptz,
  updated_at_api timestamptz,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_roblox_universe_gamepasses on public.roblox_universe_gamepasses (universe_id);

-- roblox universe stats (daily snapshots)
create table if not exists public.roblox_universe_stats_daily (
  id uuid primary key default uuid_generate_v4(),
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  stat_date date not null,
  playing bigint,
  visits bigint,
  favorites bigint,
  likes bigint,
  dislikes bigint,
  premium_visits bigint,
  premium_upsells bigint,
  engagement_score numeric,
  payout_robux numeric,
  snapshot jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  unique (universe_id, stat_date)
);

create index if not exists idx_roblox_universe_stats_daily on public.roblox_universe_stats_daily (universe_id, stat_date desc);

-- roblox explore sorts and runs
create table if not exists public.roblox_universe_sort_runs (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null,
  device text not null,
  country text not null,
  retrieved_at timestamptz not null default now()
);

create table if not exists public.roblox_universe_sort_definitions (
  sort_id text primary key,
  title text,
  description text,
  layout jsonb not null default '{}'::jsonb,
  experiments jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.roblox_universe_sort_entries (
  id uuid primary key default uuid_generate_v4(),
  sort_id text not null references public.roblox_universe_sort_definitions(sort_id) on delete cascade,
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  place_id bigint,
  rank integer,
  session_id uuid not null,
  run_id uuid references public.roblox_universe_sort_runs(id) on delete cascade,
  device text,
  country text,
  source text not null default 'explore',
  is_sponsored boolean,
  fetched_at timestamptz not null default now(),
  unique(sort_id, universe_id, session_id, fetched_at)
);

create index if not exists idx_roblox_universe_sort_entries_sort on public.roblox_universe_sort_entries (sort_id, fetched_at desc);
create index if not exists idx_roblox_universe_sort_entries_universe on public.roblox_universe_sort_entries (universe_id, fetched_at desc);

-- roblox search snapshots
create table if not exists public.roblox_universe_search_snapshots (
  id uuid primary key default uuid_generate_v4(),
  query text not null,
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  place_id bigint,
  position integer,
  session_id uuid not null,
  relevance_score numeric,
  has_verified_badge boolean,
  is_sponsored boolean,
  source text not null default 'omni-search',
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_roblox_universe_search_snapshots_query on public.roblox_universe_search_snapshots (query, fetched_at desc);
create index if not exists idx_roblox_universe_search_snapshots_universe on public.roblox_universe_search_snapshots (universe_id, fetched_at desc);

-- roblox place server snapshots
create table if not exists public.roblox_universe_place_servers (
  id uuid primary key default uuid_generate_v4(),
  place_id bigint not null,
  universe_id bigint references public.roblox_universes(universe_id) on delete cascade,
  server_id text not null,
  region text,
  ping_ms integer,
  fps numeric,
  player_count integer,
  max_players integer,
  player_list jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  unique(place_id, server_id, fetched_at)
);

create index if not exists idx_roblox_universe_place_servers_place on public.roblox_universe_place_servers (place_id, fetched_at desc);
create index if not exists idx_roblox_universe_place_servers_universe on public.roblox_universe_place_servers (universe_id, fetched_at desc);

-- codes table
create table if not exists public.codes (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references public.games(id) on delete cascade,
  code text not null,
  status text not null check (status in ('active','expired','check')),
  rewards_text text,
  level_requirement int,
  is_new boolean,
  provider_priority int not null default 0,
  posted_online boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (game_id, code)
);

drop index if exists idx_codes_game_status;
create index if not exists idx_codes_game_status_seen on public.codes (game_id, status, last_seen_at desc);
create index if not exists idx_codes_status_game on public.codes (status, game_id);
create index if not exists idx_games_published on public.games (is_published);
create index if not exists idx_games_published_name on public.games (is_published, name);
create index if not exists idx_games_author_published on public.games (author_id, is_published);
create unique index if not exists idx_codes_game_code_upper on public.codes (game_id, upper(code));
CREATE INDEX IF NOT EXISTS idx_games_slug ON public.games (LOWER(slug));
CREATE INDEX IF NOT EXISTS idx_games_old_slugs ON public.games USING gin (old_slugs);
create index if not exists idx_games_published_updated on public.games (is_published, updated_at desc);
create index if not exists idx_codes_game_first_seen on public.codes (game_id, first_seen_at desc);


-- game generation queue table
create table if not exists public.game_generation_queue (
  id uuid primary key default uuid_generate_v4(),
  game_name text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','failed','skipped')),
  attempts int not null default 0,
  last_attempted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_game_generation_queue_status_created
  on public.game_generation_queue (status, created_at);

-- article generation queue table
create table if not exists public.article_generation_queue (
  id uuid primary key default uuid_generate_v4(),
  article_title text,
  article_type text check (article_type in ('listicle','how_to','explainer','opinion','news')),
  universe_id bigint references public.roblox_universes(universe_id),
  event_id text,
  sources text,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  attempts int not null default 0,
  last_attempted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_article_generation_queue_status_created
  on public.article_generation_queue (status, created_at);
create unique index if not exists idx_article_generation_queue_event_id
  on public.article_generation_queue (event_id)
  where event_id is not null;

-- event guide generation queue table
create table if not exists public.event_guide_generation_queue (
  id uuid primary key default uuid_generate_v4(),
  event_id text not null references public.roblox_virtual_events(event_id) on delete cascade,
  universe_id bigint references public.roblox_universes(universe_id),
  guide_title text,
  guide_slug text,
  article_id uuid references public.articles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  attempts int not null default 0,
  last_attempted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_guide_generation_queue_status_created
  on public.event_guide_generation_queue (status, created_at);
create unique index if not exists idx_event_guide_generation_queue_event_id
  on public.event_guide_generation_queue (event_id);


-- app users table (role-based access)
create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin','user')),
  email text,
  display_name text,
  email_login_enabled boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  roblox_user_id bigint,
  roblox_username text,
  roblox_display_name text,
  roblox_profile_url text,
  roblox_avatar_url text,
  roblox_linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_users_role on public.app_users (role);
create unique index if not exists idx_app_users_roblox_user_id
  on public.app_users (roblox_user_id)
  where roblox_user_id is not null;

-- comments table (initially for codes pages)
create table if not exists public.comments (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('code', 'article', 'catalog', 'event', 'list', 'tool')),
  entity_id uuid not null,
  parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid references public.app_users(user_id) on delete cascade,
  guest_name text,
  guest_email text,
  body_md text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'deleted')),
  moderation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_comments_entity_created on public.comments (entity_type, entity_id, created_at desc);
create index if not exists idx_comments_parent on public.comments (parent_id);
create index if not exists idx_comments_author on public.comments (author_id);

create trigger trg_comments_updated_at
before update on public.comments
for each row
execute function public.set_updated_at();

-- articles table
create table if not exists public.articles (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text not null unique,
  content_md text not null,
  cover_image text,
  author_id uuid references public.authors(id) on delete set null,
  universe_id bigint references public.roblox_universes(universe_id),
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  word_count int,
  meta_description text,
  tags text[] not null default '{}'::text[]
);

create index if not exists idx_articles_published on public.articles (is_published);
create index if not exists idx_articles_slug on public.articles (lower(slug));
create index if not exists idx_articles_author on public.articles (author_id, is_published);
create index if not exists idx_articles_universe on public.articles (universe_id);
create index if not exists idx_articles_published_published_at on public.articles (is_published, published_at desc);

-- Images collected from article sources
create table if not exists public.article_source_images (
  id uuid primary key default uuid_generate_v4(),
  article_id uuid not null references public.articles(id) on delete cascade,
  source_url text not null,
  source_host text not null,
  name text not null,
  original_url text not null,
  uploaded_path text not null,
  public_url text,
  table_key text,
  row_text text,
  alt_text text,
  caption text,
  context text,
  is_table boolean not null default false,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists idx_article_source_images_article on public.article_source_images (article_id);
create index if not exists idx_article_source_images_source on public.article_source_images (source_host, source_url);

-- Queue table for revalidation events
create table if not exists public.revalidation_events (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('code','article','list','author')),
  slug text not null,
  source text,
  created_at timestamptz not null default now()
);

alter table if exists public.revalidation_events
  add constraint revalidation_events_entity_slug_key unique (entity_type, slug);

create index if not exists idx_revalidation_events_type_slug on public.revalidation_events (entity_type, slug);
create index if not exists idx_revalidation_events_created on public.revalidation_events (created_at desc);

create index if not exists idx_games_universe_id on public.games (universe_id);

-- game lists metadata for curated list pages
create table if not exists public.game_lists (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  display_name text,
  hero_md text,
  intro_md text,
  outro_md text,
  meta_title text,
  meta_description text,
  cover_image text,
  list_type text not null default 'sql' check (list_type in ('sql','manual','hybrid')),
  filter_config jsonb not null default '{}'::jsonb,
  limit_count int not null default 50 check (limit_count > 0),
  is_published boolean not null default false,
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_game_lists_slug on public.game_lists (lower(slug));
create index if not exists idx_game_lists_published on public.game_lists (is_published, updated_at desc);

create table if not exists public.game_list_entries (
  list_id uuid not null references public.game_lists(id) on delete cascade,
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  rank int not null,
  metric_value numeric,
  reason text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (list_id, universe_id)
);

create index if not exists idx_game_list_entries_rank on public.game_list_entries (list_id, rank);
create index if not exists idx_game_list_entries_game on public.game_list_entries (game_id);
create index if not exists idx_game_list_entries_universe on public.game_list_entries (universe_id);

-- Checklist pages and items with section codes stored on each item
create table if not exists public.checklist_pages (
  id uuid primary key default uuid_generate_v4(),
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  slug text not null,
  title text not null,
  description_md text,
  seo_title text,
  seo_description text,
  published_at timestamptz,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (universe_id, slug)
);

create index if not exists idx_checklist_pages_universe_slug on public.checklist_pages (universe_id, lower(slug));
create index if not exists idx_checklist_pages_published on public.checklist_pages (is_public, published_at desc nulls last, updated_at desc);

create table if not exists public.checklist_items (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid not null references public.checklist_pages(id) on delete cascade,
  section_code text not null check (section_code ~ '^[0-9]+(\\.[0-9]+){0,2}$'),
  title text not null,
  description text,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, section_code, title)
);

create index if not exists idx_checklist_items_page_section on public.checklist_items (page_id, section_code);
create index if not exists idx_checklist_items_page on public.checklist_items (page_id);

create table if not exists public.user_checklist_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  checklist_slug text not null,
  checked_item_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, checklist_slug)
);

create index if not exists idx_user_checklist_progress_slug
  on public.user_checklist_progress (checklist_slug);

-- helper to normalize section_code
create or replace function public.normalize_section_code(raw text) returns text as $$
declare
  cleaned text;
begin
  cleaned := regexp_replace(coalesce(raw, ''), E'[\\s\\u00A0]', '', 'g');
  cleaned := regexp_replace(cleaned, '[^0-9\\.]', '', 'g');
  cleaned := regexp_replace(cleaned, '\\.{2,}', '.', 'g');
  cleaned := regexp_replace(cleaned, '^\\.|\\.$', '', 'g');
  return cleaned;
end;
$$ language plpgsql immutable;

create or replace function public.trg_normalize_section_code() returns trigger as $$
begin
  new.section_code := public.normalize_section_code(new.section_code);
  return new;
end;
$$ language plpgsql;

-- trigger to update updated_at
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.is_admin(user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.user_id = user_uuid
      and au.role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_email_provider boolean;
begin
  has_email_provider :=
    coalesce(new.raw_app_meta_data->>'provider', '') = 'email'
    or (coalesce(new.raw_app_meta_data->'providers', '[]'::jsonb) ? 'email');

  insert into public.app_users (user_id, role, email, display_name, email_login_enabled)
  values (
    new.id,
    'user',
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'display_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    has_email_provider
  )
  on conflict (user_id)
  do update set
    email = excluded.email,
    display_name = excluded.display_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.sync_app_user_on_auth_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_users
    set email = new.email,
        display_name = coalesce(
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'name',
          new.raw_user_meta_data->>'display_name',
          split_part(coalesce(new.email, ''), '@', 1)
        ),
        updated_at = now()
  where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_app_user_on_auth_update();

-- stamp published_at only when is_published flips to true
create or replace function public.set_article_published_at() returns trigger as $$
begin
  if new.is_published = true
     and (old.is_published is distinct from true)
     and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.set_game_published_at() returns trigger as $$
begin
  if new.is_published = true
     and (old.is_published is distinct from true)
     and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.set_checklist_published_at() returns trigger as $$
begin
  if new.is_public = true
     and (old.is_public is distinct from true)
     and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.set_tool_published_at() returns trigger as $$
begin
  if new.is_published = true
     and (old.is_published is distinct from true)
     and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.set_catalog_page_published_at() returns trigger as $$
begin
  if new.is_published = true
     and (old.is_published is distinct from true)
     and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_games_updated_at on public.games;
create trigger trg_games_updated_at before update on public.games
for each row execute function public.set_updated_at();

drop trigger if exists trg_authors_updated_at on public.authors;
create trigger trg_authors_updated_at before update on public.authors
for each row execute function public.set_updated_at();

drop trigger if exists trg_game_lists_updated_at on public.game_lists;
create trigger trg_game_lists_updated_at before update on public.game_lists
for each row execute function public.set_updated_at();

drop trigger if exists trg_game_list_entries_updated_at on public.game_list_entries;
create trigger trg_game_list_entries_updated_at before update on public.game_list_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_checklist_pages_updated_at on public.checklist_pages;
create trigger trg_checklist_pages_updated_at before update on public.checklist_pages
for each row execute function public.set_updated_at();

drop trigger if exists trg_checklist_items_updated_at on public.checklist_items;
create trigger trg_checklist_items_updated_at before update on public.checklist_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_checklist_progress_updated_at on public.user_checklist_progress;
create trigger trg_user_checklist_progress_updated_at before update on public.user_checklist_progress
for each row execute function public.set_updated_at();

drop trigger if exists trg_checklist_items_normalize on public.checklist_items;
create trigger trg_checklist_items_normalize
before insert or update on public.checklist_items
for each row execute function public.trg_normalize_section_code();

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists trg_articles_updated_at on public.articles;
create trigger trg_articles_updated_at before update on public.articles
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_article_published_at on public.articles;
create trigger trg_set_article_published_at
before insert or update on public.articles
for each row execute function public.set_article_published_at();

drop trigger if exists trg_roblox_universes_updated_at on public.roblox_universes;
create trigger trg_roblox_universes_updated_at before update on public.roblox_universes
for each row execute function public.set_updated_at();

drop trigger if exists trg_game_generation_queue_updated_at on public.game_generation_queue;
create trigger trg_game_generation_queue_updated_at before update on public.game_generation_queue
for each row execute function public.set_updated_at();

drop trigger if exists trg_article_generation_queue_updated_at on public.article_generation_queue;
create trigger trg_article_generation_queue_updated_at before update on public.article_generation_queue
for each row execute function public.set_updated_at();

drop trigger if exists trg_event_guide_generation_queue_updated_at on public.event_guide_generation_queue;
create trigger trg_event_guide_generation_queue_updated_at before update on public.event_guide_generation_queue
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_game_published_at on public.games;
create trigger trg_set_game_published_at
before insert or update on public.games
for each row execute function public.set_game_published_at();

drop trigger if exists trg_set_checklist_published_at on public.checklist_pages;
create trigger trg_set_checklist_published_at
before insert or update on public.checklist_pages
for each row execute function public.set_checklist_published_at();

drop trigger if exists trg_set_tool_published_at on public.tools;
create trigger trg_set_tool_published_at
before insert or update on public.tools
for each row execute function public.set_tool_published_at();

drop trigger if exists trg_set_catalog_page_published_at on public.catalog_pages;
create trigger trg_set_catalog_page_published_at
before insert or update on public.catalog_pages
for each row execute function public.set_catalog_page_published_at();

-- helper to run SQL-driven game lists during refresh
create or replace function public.run_game_list_sql(
  sql_text text,
  limit_count int default null
)
returns table (
  universe_id bigint,
  rank int,
  metric_value numeric,
  reason text,
  extra jsonb,
  game_id uuid,
  playing bigint,
  visits bigint,
  favorites bigint,
  likes bigint,
  dislikes bigint
)
language plpgsql
set search_path = public
as $$
declare
  trimmed text;
  capped_limit int;
begin
  if sql_text is null or length(trim(sql_text)) = 0 then
    raise exception 'sql_text is required';
  end if;

  trimmed := ltrim(sql_text);
  if lower(left(trimmed, 6)) <> 'select' then
    raise exception 'sql_text must start with SELECT';
  end if;

  capped_limit := nullif(limit_count, 0);

  return query execute format(
    'select * from (%s) as src(universe_id, rank, metric_value, reason, extra, game_id, playing, visits, favorites, likes, dislikes) %s',
    sql_text,
    case
      when capped_limit is null then ''
      else format('limit %s', capped_limit)
    end
  );
end;
$$;

-- RLS
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  for r in select schemaname, tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
  end loop;

  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists "admin_full_access" on public.%I', r.tablename);
    execute format(
      'create policy "admin_full_access" on public.%I for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))',
      r.tablename
    );
  end loop;
end $$;

drop policy if exists "app_users_read_self" on public.app_users;
create policy "app_users_read_self" on public.app_users
  for select using (auth.uid() = user_id);

drop policy if exists "app_users_insert_self" on public.app_users;
create policy "app_users_insert_self" on public.app_users
  for insert with check (auth.uid() = user_id and role = 'user');

drop policy if exists "app_users_update_self" on public.app_users;
create policy "app_users_update_self" on public.app_users
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and role = 'user');

drop policy if exists "user_checklist_progress_select_own" on public.user_checklist_progress;
create policy "user_checklist_progress_select_own" on public.user_checklist_progress
  for select using (auth.uid() = user_id);

drop policy if exists "user_checklist_progress_insert_own" on public.user_checklist_progress;
create policy "user_checklist_progress_insert_own" on public.user_checklist_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_checklist_progress_update_own" on public.user_checklist_progress;
create policy "user_checklist_progress_update_own" on public.user_checklist_progress
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_checklist_progress_delete_own" on public.user_checklist_progress;
create policy "user_checklist_progress_delete_own" on public.user_checklist_progress
  for delete using (auth.uid() = user_id);

drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public" on public.comments
  for select using (
    status = 'approved'
    or author_id = auth.uid()
    or public.is_admin(auth.uid())
  );

drop policy if exists "comments_insert_authenticated" on public.comments;
create policy "comments_insert_authenticated" on public.comments
  for insert with check (
    auth.uid() = author_id
    and status = 'pending'
    and moderation is null
  );

drop policy if exists "comments_insert_guest" on public.comments;
create policy "comments_insert_guest" on public.comments
  for insert with check (
    auth.uid() is null
    and author_id is null
    and guest_name is not null
    and length(trim(guest_name)) >= 2
    and guest_email is not null
    and position('@' in guest_email) > 1
    and status = 'pending'
    and moderation is null
  );

drop policy if exists "comments_admin_update" on public.comments;
create policy "comments_admin_update" on public.comments
  for update using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own" on public.comments
  for update using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and status = 'pending'
    and moderation is null
  );

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments
  for delete using (auth.uid() = author_id);

create or replace function public.trg_comments_revalidate_code()
returns trigger
language plpgsql
as $$
begin
  if new.entity_type = 'code' and new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.revalidation_events (entity_type, slug, source)
    select 'code', g.slug, 'comment'
    from public.games g
    where g.id = new.entity_id
    on conflict (entity_type, slug)
    do update set
      source = excluded.source,
      created_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comments_revalidate_code on public.comments;
create trigger trg_comments_revalidate_code
after insert or update on public.comments
for each row execute function public.trg_comments_revalidate_code();

-- Admin insert/update via service role (bypass RLS)
-- Upsert helper for codes (ensures last_seen_at is bumped; first_seen_at preserved)
create or replace function public.upsert_code(
  p_game_id uuid,
  p_code text,
  p_status text,
  p_rewards_text text,
  p_level_requirement int,
  p_is_new boolean,
  p_provider_priority int default 0
) returns void as $$
declare
  v_code text;
  v_existing_id uuid;
begin
  v_code := nullif(btrim(p_code), '');
  if v_code is null then
    return;
  end if;

  select id
  into v_existing_id
  from public.codes
  where game_id = p_game_id
    and upper(code) = upper(v_code)
  limit 1;

  if v_existing_id is null then
    begin
      insert into public.codes (game_id, code, status, rewards_text, level_requirement, is_new, provider_priority)
      values (p_game_id, v_code, p_status, p_rewards_text, p_level_requirement, p_is_new, p_provider_priority)
      on conflict (game_id, code) do update
        set status = excluded.status,
            rewards_text = excluded.rewards_text,
            level_requirement = excluded.level_requirement,
            is_new = excluded.is_new,
            provider_priority = excluded.provider_priority,
            last_seen_at = now(),
            code = excluded.code;
    exception
      when unique_violation then
        update public.codes
        set code = v_code,
            status = p_status,
            rewards_text = p_rewards_text,
            level_requirement = p_level_requirement,
            is_new = p_is_new,
            provider_priority = p_provider_priority,
            last_seen_at = now()
        where game_id = p_game_id
          and upper(code) = upper(v_code);
    end;
  else
    update public.codes
    set code = v_code,
        status = p_status,
        rewards_text = p_rewards_text,
        level_requirement = p_level_requirement,
        is_new = p_is_new,
        provider_priority = p_provider_priority,
        last_seen_at = now()
    where id = v_existing_id;
  end if;
end;
$$ language plpgsql;
alter table public.codes
  add column if not exists posted_online boolean not null default false;

-- Views for page data aggregation

-- Codes/game pages view: game + author + universe + aggregated codes/counts + recommendations
drop view if exists public.code_pages_view;
create or replace view public.code_pages_view as
with code_stats as (
  select
    game_id,
    jsonb_agg(c order by c.status, c.last_seen_at desc) filter (where c.id is not null) as codes,
    count(*) filter (where c.status = 'active') as active_code_count,
    max(c.first_seen_at) filter (where c.status = 'active') as latest_code_first_seen_at
  from public.codes c
  group by game_id
) 
select
  g.id,
  g.name,
  g.slug,
  g.old_slugs,
  g.author_id,
  g.roblox_link,
  g.universe_id,
  g.community_link,
  g.discord_link,
  g.twitter_link,
  g.youtube_link,
  g.expired_codes,
  g.cover_image,
  g.seo_title,
  g.seo_description,
  g.intro_md,
  g.redeem_md,
  g.find_codes_md,
  g.troubleshoot_md,
  g.rewards_md,
  g.about_game_md,
  g.description_md,
  g.internal_links,
  g.is_published,
  g.re_rewritten_at,
  g.created_at,
  g.updated_at,
  u.genre_l1,
  u.genre_l2,
  coalesce(cs.codes, '[]'::jsonb) as codes,
  coalesce(cs.active_code_count, 0) as active_code_count,
  cs.latest_code_first_seen_at,
  greatest(
    coalesce(cs.latest_code_first_seen_at, g.updated_at),
    g.updated_at
  ) as content_updated_at,
  case when a.id is null then null else jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'slug', a.slug,
    'gravatar_email', a.gravatar_email,
    'avatar_url', a.avatar_url,
    'bio_md', a.bio_md,
    'twitter', a.twitter,
    'youtube', a.youtube,
    'website', a.website,
    'facebook', a.facebook,
    'linkedin', a.linkedin,
    'instagram', a.instagram,
    'roblox', a.roblox,
    'discord', a.discord,
    'created_at', a.created_at,
    'updated_at', a.updated_at
  ) end as author,
  case when u.universe_id is null then null else jsonb_build_object(
    'universe_id', u.universe_id,
    'slug', u.slug,
    'display_name', u.display_name,
    'name', u.name,
    'creator_name', u.creator_name,
    'creator_id', u.creator_id,
    'creator_type', u.creator_type,
    'social_links', u.social_links,
    'icon_url', u.icon_url,
    'genre_l1', u.genre_l1,
    'genre_l2', u.genre_l2,
    'playing', u.playing,
    'visits', u.visits,
    'favorites', u.favorites,
    'likes', u.likes,
    'dislikes', u.dislikes,
    'age_rating', u.age_rating,
    'desktop_enabled', u.desktop_enabled,
    'mobile_enabled', u.mobile_enabled,
    'tablet_enabled', u.tablet_enabled,
    'console_enabled', u.console_enabled,
    'vr_enabled', u.vr_enabled,
    'updated_at', u.updated_at,
    'description', u.description,
    'game_description_md', u.game_description_md
  ) end as universe,
  (
    select coalesce(
      jsonb_agg(rec order by rec.active_code_count desc, rec.updated_at desc),
      '[]'::jsonb
    )
    from (
      select
        g2.id,
        g2.name,
        g2.slug,
        g2.cover_image,
        coalesce(cs2.active_code_count, 0) as active_code_count,
        greatest(coalesce(cs2.latest_code_first_seen_at, g2.updated_at), g2.updated_at) as content_updated_at,
        g2.updated_at,
        u2.genre_l1,
        u2.genre_l2
      from public.games g2
      left join code_stats cs2 on cs2.game_id = g2.id
      left join public.roblox_universes u2 on u2.universe_id = g2.universe_id
      where g2.is_published = true
        and g2.id <> g.id
      order by coalesce(cs2.active_code_count, 0) desc, g2.updated_at desc
      limit 6
    ) rec
  ) as recommended_games,
  g.interlinking_ai_copy_md
from public.games g
left join code_stats cs on cs.game_id = g.id
left join public.authors a on a.id = g.author_id
left join public.roblox_universes u on u.universe_id = g.universe_id;

-- Checklist view with item counts and universe info
drop view if exists public.checklist_pages_view;
create or replace view public.checklist_pages_view as
with item_stats as (
  select
    page_id,
    count(*) as item_count,
    count(*) filter (where cardinality(string_to_array(section_code, '.')) >= 3) as leaf_item_count,
    max(updated_at) as latest_item_at
  from public.checklist_items
  group by page_id
)
select
  cp.*,
  coalesce(stats.item_count, 0) as item_count,
  coalesce(stats.leaf_item_count, 0) as leaf_item_count,
  coalesce(stats.latest_item_at, cp.updated_at) as content_updated_at,
  case when u.universe_id is null then null else jsonb_build_object(
    'universe_id', u.universe_id,
    'slug', u.slug,
    'display_name', u.display_name,
    'name', u.name,
    'icon_url', u.icon_url,
    'thumbnail_urls', u.thumbnail_urls,
    'genre_l1', u.genre_l1,
    'genre_l2', u.genre_l2
  ) end as universe
from public.checklist_pages cp
left join item_stats stats on stats.page_id = cp.id
left join public.roblox_universes u on u.universe_id = cp.universe_id;

-- Catalog pages view to keep published flags and core content together
drop view if exists public.catalog_pages_view;
create or replace view public.catalog_pages_view as
select
  cp.*,
  greatest(cp.updated_at, coalesce(cp.published_at, cp.updated_at)) as content_updated_at
from public.catalog_pages cp;

-- Articles view: article + author + universe JSON + related articles
create or replace view public.article_pages_view as
select
  art.*,
  case when a.id is null then null else jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'slug', a.slug,
    'gravatar_email', a.gravatar_email,
    'avatar_url', a.avatar_url,
    'bio_md', a.bio_md,
    'twitter', a.twitter,
    'youtube', a.youtube,
    'website', a.website,
    'facebook', a.facebook,
    'linkedin', a.linkedin,
    'instagram', a.instagram,
    'roblox', a.roblox,
    'discord', a.discord,
    'created_at', a.created_at,
    'updated_at', a.updated_at
  ) end as author,
  case when u.universe_id is null then null else jsonb_build_object(
    'universe_id', u.universe_id,
    'slug', u.slug,
    'display_name', u.display_name,
    'name', u.name,
    'icon_url', u.icon_url,
    'genre_l1', u.genre_l1,
    'genre_l2', u.genre_l2
  ) end as universe,
  (
    select coalesce(
      jsonb_agg(rec order by rec.published_at desc),
      '[]'::jsonb
    )
    from (
      select
        a2.id,
        a2.title,
        a2.slug,
        a2.cover_image,
        a2.published_at,
        a2.updated_at,
        case when a3.id is null then null else jsonb_build_object(
          'id', a3.id,
          'name', a3.name,
          'slug', a3.slug,
          'avatar_url', a3.avatar_url,
          'gravatar_email', a3.gravatar_email
        ) end as author
      from public.articles a2
      left join public.authors a3 on a3.id = a2.author_id
      where a2.is_published = true
        and a2.id <> art.id
      order by a2.published_at desc
      limit 6
    ) rec
  ) as related_articles
from public.articles art
left join public.authors a on a.id = art.author_id
left join public.roblox_universes u on u.universe_id = art.universe_id;

-- Game lists view: list + aggregated entries with universe/game details + badges + other lists
create or replace view public.game_lists_view as
select
  l.*,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'universe_id', e.universe_id,
        'list_id', e.list_id,
        'rank', e.rank,
        'metric_value', e.metric_value,
        'reason', e.reason,
        'extra', e.extra,
        'game_id', e.game_id,
        'game', case when g.id is null then null else jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'slug', g.slug,
          'cover_image', g.cover_image,
          'universe_id', g.universe_id
        ) end,
        'universe', case when u.universe_id is null then null else jsonb_build_object(
          'universe_id', u.universe_id,
          'slug', u.slug,
          'display_name', u.display_name,
          'name', u.name,
          'icon_url', u.icon_url,
          'playing', u.playing,
          'visits', u.visits,
          'favorites', u.favorites,
          'likes', u.likes,
          'dislikes', u.dislikes,
          'age_rating', u.age_rating,
          'desktop_enabled', u.desktop_enabled,
          'mobile_enabled', u.mobile_enabled,
          'tablet_enabled', u.tablet_enabled,
          'console_enabled', u.console_enabled,
          'vr_enabled', u.vr_enabled,
          'updated_at', u.updated_at,
          'description', u.description,
          'game_description_md', u.game_description_md
        ) end,
        'badges',
          (
            select coalesce(
              jsonb_agg(rec order by rec.rank),
              '[]'::jsonb
            )
            from (
              select
                gle2.list_id,
                gl2.slug as list_slug,
                gl2.title as list_title,
                gle2.rank
              from public.game_list_entries gle2
              join public.game_lists gl2 on gl2.id = gle2.list_id and gl2.is_published = true
              where gle2.universe_id = e.universe_id
                and (gl2.id <> l.id)
                and gle2.rank between 1 and 3
              order by gle2.rank
              limit 3
            ) rec
          )
      )
      order by e.rank
    ) filter (where e.universe_id is not null),
    '[]'::jsonb
  ) as entries,
  (
    select coalesce(
      jsonb_agg(rec order by rec.updated_at desc),
      '[]'::jsonb
    )
    from (
      select
        l2.id,
        l2.slug,
        l2.title,
        l2.display_name,
        l2.cover_image,
        l2.refreshed_at,
        l2.updated_at,
        te.top_image as top_entry_image
      from public.game_lists l2
      left join lateral (
        select coalesce(g3.cover_image, u3.icon_url) as top_image
        from public.game_list_entries gle3
        left join public.games g3 on g3.id = gle3.game_id
        left join public.roblox_universes u3 on u3.universe_id = gle3.universe_id
        where gle3.list_id = l2.id
        order by gle3.rank asc
        limit 1
      ) te on true
      where l2.is_published = true
        and l2.id <> l.id
      order by l2.updated_at desc
      limit 6
    ) rec
  ) as other_lists
from public.game_lists l
left join public.game_list_entries e on e.list_id = l.id
left join public.roblox_universes u on u.universe_id = e.universe_id
left join public.games g on g.id = e.game_id
group by l.id;

-- Lightweight index view for lists (no entries/badges)
drop view if exists public.game_lists_index_view;
create or replace view public.game_lists_index_view as
select
  l.id,
  l.slug,
  l.title,
  l.display_name,
  l.cover_image,
  l.limit_count,
  l.refreshed_at,
  l.updated_at,
  l.created_at,
  l.is_published,
  coalesce(
    (
      select coalesce(g3.cover_image, u3.icon_url)
      from public.game_list_entries gle3
      left join public.games g3 on g3.id = gle3.game_id
      left join public.roblox_universes u3 on u3.universe_id = gle3.universe_id
      where gle3.list_id = l.id
      order by gle3.rank asc
      limit 1
    ),
    null
  ) as top_entry_image
from public.game_lists l
where l.is_published = true;

-- Lightweight games index view
drop view if exists public.game_pages_index_view;
create or replace view public.game_pages_index_view as
select
  g.id,
  g.slug,
  g.name,
  g.is_published,
  g.cover_image,
  g.updated_at,
  g.created_at,
  g.author_id,
  g.universe_id,
  g.internal_links,
  coalesce(cs.active_code_count, 0) as active_code_count,
  cs.latest_code_first_seen_at,
  greatest(coalesce(cs.latest_code_first_seen_at, g.updated_at), g.updated_at) as content_updated_at,
  u.genre_l1,
  u.genre_l2,
  case when a.id is null then null else jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'slug', a.slug
  ) end as author
from public.games g
left join (
  select
    game_id,
    count(*) filter (where status = 'active') as active_code_count,
    max(first_seen_at) filter (where status = 'active') as latest_code_first_seen_at
  from public.codes
  group by game_id
) cs on cs.game_id = g.id
left join public.authors a on a.id = g.author_id
left join public.roblox_universes u on u.universe_id = g.universe_id
where g.is_published is not null;

-- Lightweight articles index view
drop view if exists public.article_pages_index_view;
create or replace view public.article_pages_index_view as
select
  art.id,
  art.title,
  art.slug,
  art.cover_image,
  art.meta_description,
  art.published_at,
  art.created_at,
  art.updated_at,
  art.is_published,
  art.universe_id,
  case when a.id is null then null else jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'slug', a.slug,
    'avatar_url', a.avatar_url,
    'gravatar_email', a.gravatar_email
  ) end as author,
  case when u.universe_id is null then null else jsonb_build_object(
    'universe_id', u.universe_id,
    'slug', u.slug,
    'display_name', u.display_name,
    'name', u.name,
    'icon_url', u.icon_url
  ) end as universe
from public.articles art
left join public.authors a on a.id = art.author_id
left join public.roblox_universes u on u.universe_id = art.universe_id
where art.is_published is not null;

-- tools table for calculator/tool pages
create table if not exists public.tools (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  title text not null,
  seo_title text not null,
  meta_description text not null,
  intro_md text not null,
  how_it_works_md text not null,
  description_json jsonb not null default '{}'::jsonb,
  faq_json jsonb not null default '[]'::jsonb,
  cta_label text,
  cta_url text,
  schema_ld_json jsonb,
  thumb_url text,
  is_published boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tools_is_published on public.tools (is_published);

create trigger trg_tools_updated_at
before update on public.tools
for each row
execute function public.set_updated_at();

-- catalog pages table for item/id listing pages
create table if not exists public.catalog_pages (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  title text not null,
  seo_title text not null,
  meta_description text not null,
  intro_md text not null,
  how_it_works_md text not null,
  description_json jsonb not null default '{}'::jsonb,
  faq_json jsonb not null default '[]'::jsonb,
  cta_label text,
  cta_url text,
  schema_ld_json jsonb,
  thumb_url text,
  is_published boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_catalog_pages_is_published on public.catalog_pages (is_published);

create trigger trg_catalog_pages_updated_at
before update on public.catalog_pages
for each row
execute function public.set_updated_at();

-- Roblox music IDs from the music discovery top songs list
create table if not exists public.roblox_music_ids (
  asset_id bigint primary key,
  title text not null,
  artist text not null,
  album text,
  genre text,
  duration_seconds integer,
  album_art_asset_id bigint,
  thumbnail_url text,
  rank integer,
  source text not null default 'music_discovery_top_songs',
  boombox_ready boolean not null default false,
  boombox_ready_reason text,
  verified_at timestamptz,
  product_info_json jsonb,
  asset_delivery_status integer,
  vote_count bigint,
  upvote_percent integer,
  creator_verified boolean,
  popularity_score double precision not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roblox_music_ids_rank on public.roblox_music_ids (rank);
create index if not exists idx_roblox_music_ids_last_seen on public.roblox_music_ids (last_seen_at desc);
create index if not exists idx_roblox_music_ids_boombox_ready on public.roblox_music_ids (boombox_ready);
create index if not exists idx_roblox_music_ids_popularity_score on public.roblox_music_ids (popularity_score desc);
create index if not exists idx_roblox_music_ids_verified_at on public.roblox_music_ids (verified_at);

create trigger trg_roblox_music_ids_updated_at
before update on public.roblox_music_ids
for each row
execute function public.set_updated_at();

drop view if exists public.roblox_music_ids_boombox_view;
create or replace view public.roblox_music_ids_boombox_view as
select
  asset_id,
  title,
  artist,
  album,
  genre,
  duration_seconds,
  album_art_asset_id,
  thumbnail_url,
  rank,
  source,
  raw_payload,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at,
  boombox_ready,
  boombox_ready_reason,
  verified_at,
  product_info_json,
  asset_delivery_status,
  vote_count,
  upvote_percent,
  creator_verified,
  popularity_score
from public.roblox_music_ids
where boombox_ready is true;

-- Roblox music ID option views (genres + artists)
drop view if exists public.roblox_music_genres_view;
create or replace view public.roblox_music_genres_view as
with normalized as (
  select
    trim(genre) as label,
    regexp_replace(
      trim(
        regexp_replace(replace(lower(trim(genre)), '&', 'and'), '[^a-z0-9]+', ' ', 'g')
      ),
      '\s+',
      '-',
      'g'
    ) as slug
  from public.roblox_music_ids
  where genre is not null
    and trim(genre) <> ''
)
select
  slug,
  (array_agg(label order by length(label) desc, label asc))[1] as label,
  count(*)::int as item_count
from normalized
where slug <> ''
group by slug;

drop view if exists public.roblox_music_artists_view;
create or replace view public.roblox_music_artists_view as
with normalized as (
  select
    trim(artist) as label,
    regexp_replace(
      trim(
        regexp_replace(replace(lower(trim(artist)), '&', 'and'), '[^a-z0-9]+', ' ', 'g')
      ),
      '\s+',
      '-',
      'g'
    ) as slug
  from public.roblox_music_ids
  where artist is not null
    and trim(artist) <> ''
)
select
  slug,
  (array_agg(label order by length(label) desc, label asc))[1] as label,
  count(*)::int as item_count
from normalized
where slug <> ''
group by slug;

-- Roblox virtual events data
create table if not exists public.roblox_virtual_events (
  event_id text primary key,
  universe_id bigint not null references public.roblox_universes(universe_id) on delete restrict,
  place_id bigint,
  title text,
  display_title text,
  subtitle text,
  display_subtitle text,
  description text,
  display_description text,
  tagline text,
  start_utc timestamptz,
  end_utc timestamptz,
  created_utc timestamptz,
  updated_utc timestamptz,
  first_live_at timestamptz,
  event_status text,
  event_visibility text,
  featuring_status text,
  all_thumbnails_created boolean,
  host_name text,
  host_has_verified_badge boolean,
  host_type text,
  host_id bigint,
  event_summary_md text,
  event_details_md text,
  guide_slug text,
  raw_event_json jsonb
);

create table if not exists public.roblox_virtual_event_categories (
  event_id text not null references public.roblox_virtual_events(event_id) on delete cascade,
  category text not null,
  rank integer not null,
  primary key (event_id, rank)
);

create table if not exists public.roblox_virtual_event_thumbnails (
  event_id text not null references public.roblox_virtual_events(event_id) on delete cascade,
  media_id bigint not null,
  rank integer not null,
  primary key (event_id, rank)
);

create index if not exists idx_roblox_virtual_events_universe_id
  on public.roblox_virtual_events (universe_id);
create index if not exists idx_roblox_virtual_events_start_utc
  on public.roblox_virtual_events (start_utc);
create index if not exists idx_roblox_virtual_events_event_status
  on public.roblox_virtual_events (event_status);
create index if not exists idx_roblox_virtual_events_first_live_at
  on public.roblox_virtual_events (first_live_at);

-- Event pages (one per universe)
create table if not exists public.events_pages (
  id uuid primary key default uuid_generate_v4(),
  universe_id bigint not null references public.roblox_universes(universe_id) on delete cascade,
  slug text,
  title text not null,
  content_md text,
  seo_title text,
  meta_description text,
  author_id uuid references public.authors(id) on delete set null,
  is_published boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (universe_id)
);

create index if not exists idx_events_pages_is_published on public.events_pages (is_published);
create unique index if not exists idx_events_pages_slug on public.events_pages (slug);
create index if not exists idx_events_pages_author on public.events_pages (author_id, is_published);

create trigger trg_events_pages_updated_at
before update on public.events_pages
for each row
execute function public.set_updated_at();

create trigger trg_set_events_pages_published_at
before insert or update on public.events_pages
for each row
execute function public.set_catalog_page_published_at();

-- Roblox catalog items + discovery/enrichment support tables
create table if not exists public.roblox_catalog_items (
  asset_id bigint primary key,
  item_type text not null default 'Asset',
  asset_type_id integer,
  category text,
  subcategory text,
  name text,
  description text,
  price_robux bigint,
  price_status text,
  lowest_price_robux bigint,
  lowest_resale_price_robux bigint,
  is_for_sale boolean,
  is_limited boolean,
  is_limited_unique boolean,
  remaining bigint,
  creator_id bigint,
  creator_target_id bigint,
  creator_name text,
  creator_type text,
  creator_has_verified_badge boolean,
  product_id bigint,
  collectible_item_id text,
  favorite_count bigint,
  has_resellers boolean,
  total_quantity bigint,
  units_available_for_consumption bigint,
  quantity_limit_per_user bigint,
  sale_location_type text,
  off_sale_deadline timestamptz,
  item_status jsonb,
  item_restrictions jsonb,
  bundled_items jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_enriched_at timestamptz,
  is_deleted boolean not null default false,
  raw_catalog_json jsonb not null default '{}'::jsonb,
  raw_economy_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Trading/RAP data from Roblox Economy API
  rap bigint,
  rap_sales integer,
  rap_stock integer,
  rap_price_points jsonb default '[]'::jsonb,
  rap_volume_points jsonb default '[]'::jsonb,
  rap_last_fetched timestamptz,
  -- Type distinction and UGC support
  limited_type text check (limited_type in ('classic', 'ugc')),
  -- Calculated trading metrics
  trading_value bigint,
  trading_value_confidence integer check (trading_value_confidence >= 0 and trading_value_confidence <= 100),
  trend_direction text check (trend_direction in ('rising', 'stable', 'falling')),
  trend_strength integer check (trend_strength >= 0 and trend_strength <= 100),
  trend_change_7d numeric,
  trend_change_30d numeric,
  demand_level text check (demand_level in ('amazing', 'popular', 'normal', 'terrible')),
  demand_score integer check (demand_score >= 0 and demand_score <= 100),
  demand_sales_per_day numeric,
  demand_consistency integer check (demand_consistency >= 0 and demand_consistency <= 100),
  is_projected boolean default false,
  projected_confidence integer check (projected_confidence >= 0 and projected_confidence <= 100),
  projected_reason text,
  trading_metrics_calculated_at timestamptz
);

create index if not exists idx_roblox_catalog_items_category
  on public.roblox_catalog_items (category);
create index if not exists idx_roblox_catalog_items_subcategory
  on public.roblox_catalog_items (subcategory);
create index if not exists idx_roblox_catalog_items_asset_type_id
  on public.roblox_catalog_items (asset_type_id);
create index if not exists idx_roblox_catalog_items_creator_id
  on public.roblox_catalog_items (creator_id);
create index if not exists idx_roblox_catalog_items_price_robux
  on public.roblox_catalog_items (price_robux);
create index if not exists idx_roblox_catalog_items_last_seen_at
  on public.roblox_catalog_items (last_seen_at desc);
create index if not exists idx_roblox_catalog_items_is_for_sale
  on public.roblox_catalog_items (is_for_sale);
create index if not exists idx_roblox_catalog_items_is_limited
  on public.roblox_catalog_items (is_limited);

-- Trading data indexes
create index if not exists idx_roblox_catalog_items_limited_tradeable
  on public.roblox_catalog_items (is_limited, is_limited_unique, trading_value desc nulls last)
  where (is_limited = true or is_limited_unique = true) and trading_value is not null;
create index if not exists idx_roblox_catalog_items_trading_value
  on public.roblox_catalog_items (trading_value desc nulls last)
  where is_limited = true or is_limited_unique = true;
create index if not exists idx_roblox_catalog_items_rap
  on public.roblox_catalog_items (rap desc nulls last)
  where is_limited = true or is_limited_unique = true;
create index if not exists idx_roblox_catalog_items_demand_level
  on public.roblox_catalog_items (demand_level, trading_value desc nulls last)
  where is_limited = true or is_limited_unique = true;
create index if not exists idx_roblox_catalog_items_trend_direction
  on public.roblox_catalog_items (trend_direction, trading_value desc nulls last)
  where is_limited = true or is_limited_unique = true;
create index if not exists idx_roblox_catalog_items_projected
  on public.roblox_catalog_items (is_projected, trading_value desc nulls last)
  where is_limited = true or is_limited_unique = true;
create index if not exists idx_roblox_catalog_items_rap_last_fetched
  on public.roblox_catalog_items (rap_last_fetched desc nulls last)
  where is_limited = true or is_limited_unique = true;

create trigger trg_roblox_catalog_items_updated_at
before update on public.roblox_catalog_items
for each row
execute function public.set_updated_at();

create table if not exists public.roblox_catalog_item_images (
  asset_id bigint not null references public.roblox_catalog_items(asset_id) on delete cascade,
  size text not null,
  format text not null,
  image_url text,
  state text,
  version text,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (asset_id, size, format)
);

create index if not exists idx_roblox_catalog_item_images_state
  on public.roblox_catalog_item_images (state);

create trigger trg_roblox_catalog_item_images_updated_at
before update on public.roblox_catalog_item_images
for each row
execute function public.set_updated_at();

create table if not exists public.roblox_catalog_categories (
  category text primary key,
  name text,
  category_id integer,
  order_index integer,
  is_searchable boolean,
  asset_type_ids integer[] not null default '{}',
  bundle_type_ids integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_roblox_catalog_categories_updated_at
before update on public.roblox_catalog_categories
for each row
execute function public.set_updated_at();

create table if not exists public.roblox_catalog_subcategories (
  subcategory text primary key,
  category text not null references public.roblox_catalog_categories(category) on delete cascade,
  name text,
  short_name text,
  subcategory_id integer,
  asset_type_ids integer[] not null default '{}',
  bundle_type_ids integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roblox_catalog_subcategories_category
  on public.roblox_catalog_subcategories (category);

create trigger trg_roblox_catalog_subcategories_updated_at
before update on public.roblox_catalog_subcategories
for each row
execute function public.set_updated_at();

create table if not exists public.roblox_catalog_discovery_runs (
  run_id uuid primary key default uuid_generate_v4(),
  strategy text not null,
  category text,
  subcategory text,
  keyword text,
  sort_type text,
  page_limit integer,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roblox_catalog_discovery_runs_status
  on public.roblox_catalog_discovery_runs (status);

create trigger trg_roblox_catalog_discovery_runs_updated_at
before update on public.roblox_catalog_discovery_runs
for each row
execute function public.set_updated_at();

create table if not exists public.roblox_catalog_discovery_hits (
  run_id uuid not null references public.roblox_catalog_discovery_runs(run_id) on delete cascade,
  asset_id bigint not null references public.roblox_catalog_items(asset_id) on delete cascade,
  query_hash text,
  category text,
  subcategory text,
  keyword text,
  sort_type text,
  cursor_page integer,
  seen_at timestamptz not null default now(),
  primary key (run_id, asset_id)
);

create index if not exists idx_roblox_catalog_discovery_hits_asset_id
  on public.roblox_catalog_discovery_hits (asset_id);
create index if not exists idx_roblox_catalog_discovery_hits_query_hash
  on public.roblox_catalog_discovery_hits (query_hash);

create table if not exists public.roblox_catalog_refresh_queue (
  asset_id bigint primary key references public.roblox_catalog_items(asset_id) on delete cascade,
  priority text not null default 'new',
  next_run_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roblox_catalog_refresh_queue_next_run_at
  on public.roblox_catalog_refresh_queue (next_run_at);
create index if not exists idx_roblox_catalog_refresh_queue_priority
  on public.roblox_catalog_refresh_queue (priority);

create trigger trg_roblox_catalog_refresh_queue_updated_at
before update on public.roblox_catalog_refresh_queue
for each row
execute function public.set_updated_at();

-- Catalog items history table for tracking changes over time
create table if not exists public.roblox_catalog_items_history (
  asset_id bigint not null references public.roblox_catalog_items(asset_id) on delete cascade,
  recorded_at timestamptz not null default now(),
  rap bigint,
  sales integer,
  price_robux bigint,
  is_for_sale boolean,
  favorite_count bigint,
  primary key (asset_id, recorded_at)
);

create index if not exists idx_roblox_catalog_items_history_asset
  on public.roblox_catalog_items_history (asset_id, recorded_at desc);
create index if not exists idx_roblox_catalog_items_history_recorded_at
  on public.roblox_catalog_items_history (recorded_at desc);

-- Limited items trading view
create or replace view public.limited_items_trading_view as
select
  ci.asset_id,
  ci.name,
  ci.description,
  ci.item_type,
  ci.asset_type_id,
  ci.category,
  ci.subcategory,
  ci.is_limited,
  ci.is_limited_unique,
  ci.creator_name,
  ci.creator_type,
  ci.creator_has_verified_badge,
  ci.remaining,
  ci.rap,
  ci.rap_sales,
  ci.rap_stock,
  ci.rap_last_fetched,
  ci.trading_value,
  ci.trading_value_confidence,
  ci.trend_direction,
 ci.trend_strength,
  ci.trend_change_7d,
  ci.trend_change_30d,
  ci.demand_level,
  ci.demand_score,
  ci.demand_sales_per_day,
  ci.demand_consistency,
  ci.is_projected,
  ci.projected_confidence,
  ci.projected_reason,
  ci.trading_metrics_calculated_at,
  ci.updated_at,
  ci.created_at,
  case
    when ci.is_projected = true then 'projected'
    when ci.demand_level = 'amazing' then 'high_demand'
    when ci.trend_direction = 'rising' and ci.trend_strength > 70 then 'trending_up'
    when ci.rap is not null and ci.trading_value is null then 'needs_calculation'
    else 'normal'
  end as status_flag,
  case
    when ci.rap is not null and ci.trading_value is not null and ci.rap > 0
    then round(((ci.rap - ci.trading_value)::numeric / ci.rap) * 100, 2)
    else null
  end as rap_value_diff_percent,
  case
    when ci.rap_last_fetched is null then 'never_fetched'
    when ci.rap_last_fetched > now() - interval '12 hours' then 'fresh'
    when ci.rap_last_fetched > now() - interval '24 hours' then 'recent'
    when ci.rap_last_fetched > now() - interval '7 days' then 'stale'
    else 'outdated'
  end as data_freshness,
  case
    when ci.trading_metrics_calculated_at is null then 'never_calculated'
    when ci.trading_metrics_calculated_at > now() - interval '1 hour' then 'fresh'
    when ci.trading_metrics_calculated_at > now() - interval '6 hours' then 'recent'
    when ci.trading_metrics_calculated_at > now() - interval '24 hours' then 'stale'
    else 'outdated'
  end as metrics_freshness
from public.roblox_catalog_items ci
where ci.is_limited = true or ci.is_limited_unique = true;

-- Unified search index for global site search
create table if not exists public.search_index (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null,
  entity_id text not null,
  slug text not null,
  title text not null,
  subtitle text,
  url text not null,
  updated_at timestamptz,
  is_published boolean not null default true,
  search_text text not null default '',
  search_vector tsvector generated always as (to_tsvector('english', search_text)) stored
);

create unique index if not exists idx_search_index_entity on public.search_index (entity_type, entity_id);
create index if not exists idx_search_index_type_slug on public.search_index (entity_type, slug);
create index if not exists idx_search_index_published_updated on public.search_index (is_published, updated_at desc);
create index if not exists idx_search_index_vector on public.search_index using gin (search_vector);
create index if not exists idx_search_index_search_text_trgm on public.search_index using gin (search_text gin_trgm_ops);

create or replace function public.upsert_search_index(
  p_entity_type text,
  p_entity_id text,
  p_slug text,
  p_title text,
  p_subtitle text,
  p_url text,
  p_updated_at timestamptz,
  p_is_published boolean,
  p_search_text text
)
returns void
language plpgsql
as $$
begin
  if p_entity_id is null or trim(p_entity_id) = '' then
    return;
  end if;
  if p_slug is null or trim(p_slug) = '' then
    return;
  end if;
  if p_title is null or trim(p_title) = '' then
    return;
  end if;
  if p_url is null or trim(p_url) = '' then
    return;
  end if;

  insert into public.search_index (
    entity_type,
    entity_id,
    slug,
    title,
    subtitle,
    url,
    updated_at,
    is_published,
    search_text
  )
  values (
    lower(p_entity_type),
    p_entity_id,
    lower(trim(p_slug)),
    p_title,
    p_subtitle,
    p_url,
    p_updated_at,
    coalesce(p_is_published, false),
    coalesce(p_search_text, '')
  )
  on conflict (entity_type, entity_id)
  do update set
    slug = excluded.slug,
    title = excluded.title,
    subtitle = excluded.subtitle,
    url = excluded.url,
    updated_at = excluded.updated_at,
    is_published = excluded.is_published,
    search_text = excluded.search_text;
end;
$$;

create or replace function public.search_site(
  p_query text,
  p_limit integer default 120,
  p_offset integer default 0
)
returns table (
  entity_type text,
  entity_id text,
  slug text,
  title text,
  subtitle text,
  url text,
  updated_at timestamptz,
  active_code_count bigint
)
language plpgsql
stable
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 120), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_query = '' then
    return;
  end if;

  return query
  with q as (
    select websearch_to_tsquery('english', v_query) as tsq
  )
  select
    si.entity_type,
    si.entity_id,
    si.slug,
    si.title,
    si.subtitle,
    si.url,
    coalesce(g.content_updated_at, si.updated_at) as updated_at,
    case when si.entity_type = 'code' then g.active_code_count else null end as active_code_count
  from public.search_index si
  cross join q
  left join public.game_pages_index_view g
    on si.entity_type = 'code'
    and g.id::text = si.entity_id
  where si.is_published = true
    and (
      si.search_vector @@ q.tsq
      or si.search_text ilike '%' || v_query || '%'
    )
  order by
    greatest(
      ts_rank_cd(si.search_vector, q.tsq),
      similarity(si.search_text, v_query)
    ) desc,
    updated_at desc nulls last
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.trg_search_index_games()
returns trigger
language plpgsql
as $$
declare
  v_search text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
    where entity_type = 'code'
      and entity_id = old.id::text;
    return null;
  end if;

  v_search := left(
    concat_ws(
      ' ',
      new.name,
      new.slug,
      array_to_string(new.old_slugs, ' '),
      new.seo_title,
      new.seo_description,
      new.intro_md,
      new.description_md,
      new.find_codes_md,
      new.about_game_md
    ),
    4000
  );

  perform public.upsert_search_index(
    'code',
    new.id::text,
    new.slug,
    new.name,
    'Codes',
    '/codes/' || new.slug,
    new.updated_at,
    new.is_published,
    v_search
  );

  return null;
end;
$$;

create or replace function public.trg_search_index_articles()
returns trigger
language plpgsql
as $$
declare
  v_search text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
    where entity_type = 'article'
      and entity_id = old.id::text;
    return null;
  end if;

  v_search := left(
    concat_ws(
      ' ',
      new.title,
      new.slug,
      new.meta_description,
      new.content_md
    ),
    4000
  );

  perform public.upsert_search_index(
    'article',
    new.id::text,
    new.slug,
    new.title,
    'Article',
    '/articles/' || new.slug,
    new.updated_at,
    new.is_published,
    v_search
  );

  return null;
end;
$$;

create or replace function public.trg_search_index_checklists()
returns trigger
language plpgsql
as $$
declare
  v_search text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
    where entity_type = 'checklist'
      and entity_id = old.id::text;
    return null;
  end if;

  v_search := left(
    concat_ws(
      ' ',
      new.title,
      new.slug,
      new.description_md,
      new.seo_description
    ),
    3000
  );

  perform public.upsert_search_index(
    'checklist',
    new.id::text,
    new.slug,
    new.title,
    'Checklist',
    '/checklists/' || new.slug,
    new.updated_at,
    new.is_public,
    v_search
  );

  return null;
end;
$$;

create or replace function public.trg_search_index_game_lists()
returns trigger
language plpgsql
as $$
declare
  v_title text;
  v_search text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
    where entity_type = 'list'
      and entity_id = old.id::text;
    return null;
  end if;

  v_title := coalesce(new.display_name, new.title);
  v_search := left(
    concat_ws(
      ' ',
      v_title,
      new.title,
      new.slug,
      new.meta_title,
      new.meta_description,
      new.hero_md,
      new.intro_md,
      new.outro_md
    ),
    3000
  );

  perform public.upsert_search_index(
    'list',
    new.id::text,
    new.slug,
    v_title,
    'List',
    '/lists/' || new.slug,
    new.updated_at,
    new.is_published,
    v_search
  );

  return null;
end;
$$;

create or replace function public.trg_search_index_tools()
returns trigger
language plpgsql
as $$
declare
  v_search text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
    where entity_type = 'tool'
      and entity_id = old.id::text;
    return null;
  end if;

  v_search := left(
    concat_ws(
      ' ',
      new.title,
      new.code,
      new.seo_title,
      new.meta_description,
      new.intro_md,
      new.how_it_works_md
    ),
    3000
  );

  perform public.upsert_search_index(
    'tool',
    new.id::text,
    new.code,
    new.title,
    'Tool',
    '/tools/' || new.code,
    new.updated_at,
    new.is_published,
    v_search
  );

  return null;
end;
$$;

create or replace function public.trg_search_index_catalog_pages()
returns trigger
language plpgsql
as $$
declare
  v_search text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
    where entity_type = 'catalog'
      and entity_id = old.id::text;
    return null;
  end if;

  v_search := left(
    concat_ws(
      ' ',
      new.title,
      new.code,
      new.seo_title,
      new.meta_description,
      new.intro_md,
      new.how_it_works_md
    ),
    3000
  );

  perform public.upsert_search_index(
    'catalog',
    new.id::text,
    new.code,
    new.title,
    'Catalog',
    '/catalog/' || new.code,
    new.updated_at,
    new.is_published,
    v_search
  );

  return null;
end;
$$;

create or replace function public.trg_search_index_events_pages()
returns trigger
language plpgsql
as $$
declare
  v_search text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
    where entity_type = 'event'
      and entity_id = old.id::text;
    return null;
  end if;

  if new.slug is null or trim(new.slug) = '' then
    return null;
  end if;

  v_search := left(
    concat_ws(
      ' ',
      new.title,
      new.slug,
      new.meta_description,
      new.content_md
    ),
    3000
  );

  perform public.upsert_search_index(
    'event',
    new.id::text,
    new.slug,
    new.title,
    'Event',
    '/events/' || new.slug,
    new.updated_at,
    new.is_published,
    v_search
  );

  return null;
end;
$$;

create or replace function public.trg_search_index_authors()
returns trigger
language plpgsql
as $$
declare
  v_search text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
    where entity_type = 'author'
      and entity_id = old.id::text;
    return null;
  end if;

  v_search := left(
    concat_ws(
      ' ',
      new.name,
      new.slug,
      new.bio_md
    ),
    2000
  );

  perform public.upsert_search_index(
    'author',
    new.id::text,
    new.slug,
    new.name,
    'Author',
    '/authors/' || new.slug,
    new.updated_at,
    true,
    v_search
  );

  return null;
end;
$$;

create or replace function public.refresh_search_index_music()
returns void
language plpgsql
as $$
begin
  delete from public.search_index
  where entity_type in ('music_hub', 'music_genre', 'music_artist');

  insert into public.search_index (
    entity_type,
    entity_id,
    slug,
    title,
    subtitle,
    url,
    updated_at,
    is_published,
    search_text
  )
  values
    ('music_hub', 'roblox-music-ids', 'roblox-music-ids', 'Roblox Music IDs', 'Music IDs', '/catalog/roblox-music-ids', now(), true, 'roblox music ids songs audio'),
    ('music_hub', 'roblox-music-ids-trending', 'roblox-music-ids-trending', 'Trending Roblox Music IDs', 'Music IDs', '/catalog/roblox-music-ids/trending', now(), true, 'trending roblox music ids'),
    ('music_hub', 'roblox-music-ids-genres', 'roblox-music-ids-genres', 'Roblox Music Genres', 'Music IDs', '/catalog/roblox-music-ids/genres', now(), true, 'roblox music ids genres'),
    ('music_hub', 'roblox-music-ids-artists', 'roblox-music-ids-artists', 'Roblox Music Artists', 'Music IDs', '/catalog/roblox-music-ids/artists', now(), true, 'roblox music ids artists');
end;
$$;

create or replace function public.trg_refresh_search_index_music()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_search_index_music();
  return null;
end;
$$;

drop trigger if exists trg_search_index_games on public.games;
create trigger trg_search_index_games
after insert or update or delete on public.games
for each row execute function public.trg_search_index_games();

drop trigger if exists trg_search_index_articles on public.articles;
create trigger trg_search_index_articles
after insert or update or delete on public.articles
for each row execute function public.trg_search_index_articles();

drop trigger if exists trg_search_index_checklists on public.checklist_pages;
create trigger trg_search_index_checklists
after insert or update or delete on public.checklist_pages
for each row execute function public.trg_search_index_checklists();

drop trigger if exists trg_search_index_game_lists on public.game_lists;
create trigger trg_search_index_game_lists
after insert or update or delete on public.game_lists
for each row execute function public.trg_search_index_game_lists();

drop trigger if exists trg_search_index_tools on public.tools;
create trigger trg_search_index_tools
after insert or update or delete on public.tools
for each row execute function public.trg_search_index_tools();

drop trigger if exists trg_search_index_catalog_pages on public.catalog_pages;
create trigger trg_search_index_catalog_pages
after insert or update or delete on public.catalog_pages
for each row execute function public.trg_search_index_catalog_pages();

drop trigger if exists trg_search_index_events_pages on public.events_pages;
create trigger trg_search_index_events_pages
after insert or update or delete on public.events_pages
for each row execute function public.trg_search_index_events_pages();

drop trigger if exists trg_search_index_authors on public.authors;
create trigger trg_search_index_authors
after insert or update or delete on public.authors
for each row execute function public.trg_search_index_authors();

drop trigger if exists trg_refresh_search_index_music on public.roblox_music_ids;
create trigger trg_refresh_search_index_music
after insert or update or delete on public.roblox_music_ids
for each statement execute function public.trg_refresh_search_index_music();
