-- Caisse Inter-Marin-et-Maël : données partagées entre les appareils.
-- Accès réservé au compte du magasin : le premier compte créé devient membre,
-- les comptes suivants ne voient rien tant qu'on ne les ajoute pas à public.membres.

-- ——— Membres du magasin ———
create table public.membres (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
alter table public.membres enable row level security;
create policy "un membre voit sa ligne" on public.membres
  for select to authenticated using (user_id = (select auth.uid()));

create function public.est_membre() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.membres where user_id = (select auth.uid())) $$;
revoke execute on function public.est_membre() from public, anon;
grant execute on function public.est_membre() to authenticated;

create function public.premier_membre() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  lock table public.membres in exclusive mode;
  if not exists (select 1 from public.membres) then
    insert into public.membres (user_id) values (new.id);
  end if;
  return new;
end $$;
revoke execute on function public.premier_membre() from public, anon, authenticated;
create trigger premier_compte_devient_membre
  after insert on auth.users for each row execute function public.premier_membre();

-- ——— Tables de la caisse ———
create table public.articles (
  id text primary key,
  rayon smallint not null check (rayon between 1 and 8),
  ppp smallint not null check (ppp >= 0),
  nom text not null check (length(nom) between 1 and 60),
  prix integer not null check (prix >= 0),
  vente text not null check (vente in ('piece', 'kg', 'barq')),
  ean text unique check (ean ~ '^\d{8}$|^\d{12,13}$'),
  modifie_le timestamptz not null default now()
);

create sequence public.cartes_num_seq start 43;
create table public.cartes (
  num integer primary key check (num > 0),
  nom text not null,
  tampons integer not null default 0 check (tampons >= 0),
  surprises integer not null default 0 check (surprises >= 0),
  modifie_le timestamptz not null default now()
);

create table public.personnel (
  id text primary key,
  nom text not null,
  role text not null,
  pin text not null check (pin ~ '^\d{4,6}$'),
  badge integer not null unique,
  couleur text not null,
  responsable boolean not null default false,
  ordre smallint not null default 0
);

create table public.reglages (
  cle text primary key,
  valeur jsonb not null
);

create table public.clotures (
  id uuid primary key default gen_random_uuid(),
  jour date not null default current_date,
  cree_le timestamptz not null default now(),
  resume jsonb not null
);

create table public.tickets (
  id uuid primary key,
  no integer not null,
  statut text not null check (statut in ('paye', 'annule')),
  ferme_le timestamptz not null default now(),
  jour date not null default current_date,
  caissier text,
  caisse text,
  total integer not null default 0,
  articles integer not null default 0,
  remises integer not null default 0,
  lignes_annulees integer not null default 0,
  especes integer not null default 0,
  carte integer not null default 0,
  num_carte integer,
  tampons integer not null default 0,
  detail jsonb,
  cloture_id uuid references public.clotures (id)
);
create index tickets_ouverts on public.tickets (ferme_le) where cloture_id is null;
create index tickets_recents on public.tickets (ferme_le desc);
create index tickets_cloture on public.tickets (cloture_id);

-- ——— Accès : seulement les membres du magasin ———
do $$
declare t text;
begin
  foreach t in array array['articles', 'cartes', 'personnel', 'reglages', 'clotures', 'tickets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "membres du magasin" on public.%I for all to authenticated using ((select public.est_membre())) with check ((select public.est_membre()))', t);
  end loop;
end $$;
revoke all on public.membres from anon;
revoke all on sequence public.cartes_num_seq from anon;
grant usage on sequence public.cartes_num_seq to authenticated;

-- ——— Fonctions appelées par la caisse (droits de l'appelant, donc filtrées par les règles d'accès) ———

-- Enregistre un ticket une seule fois (même si l'appareil réessaie) et ajoute les tampons Copains.
create function public.enregistrer_ticket(p jsonb) returns public.cartes
language plpgsql security invoker set search_path = ''
as $$
declare
  c public.cartes;
  n integer := coalesce((p ->> 'tampons')::integer, 0);
  carte integer := (p ->> 'num_carte')::integer;
begin
  insert into public.tickets (id, no, statut, ferme_le, jour, caissier, caisse, total, articles, remises,
                              lignes_annulees, especes, carte, num_carte, tampons, detail)
  values ((p ->> 'id')::uuid, (p ->> 'no')::integer, p ->> 'statut',
          coalesce((p ->> 'ferme_le')::timestamptz, now()), coalesce((p ->> 'jour')::date, current_date),
          p ->> 'caissier', p ->> 'caisse',
          coalesce((p ->> 'total')::integer, 0), coalesce((p ->> 'articles')::integer, 0),
          coalesce((p ->> 'remises')::integer, 0), coalesce((p ->> 'lignes_annulees')::integer, 0),
          coalesce((p ->> 'especes')::integer, 0), coalesce((p ->> 'carte')::integer, 0),
          carte, n, p -> 'detail')
  on conflict (id) do nothing;
  if not found or carte is null then
    return null;
  end if;
  insert into public.cartes (num, nom) values (carte, coalesce(p ->> 'nom_carte', 'Copain')) on conflict (num) do nothing;
  if n > 0 then
    update public.cartes
       set surprises = surprises + (tampons + n) / 10,
           tampons = (tampons + n) % 10,
           modifie_le = now()
     where num = carte;
  end if;
  select * into c from public.cartes where num = carte;
  return c;
end $$;

-- Nouvelle carte Copains avec le numéro suivant.
create function public.nouvelle_carte(p_nom text) returns public.cartes
language sql security invoker set search_path = ''
as $$
  insert into public.cartes (num, nom) values (nextval('public.cartes_num_seq'), coalesce(nullif(trim(p_nom), ''), 'Copain'))
  returning *;
$$;

-- Ouverture du tiroir (compteur du jour).
create function public.ouvrir_tiroir() returns integer
language sql security invoker set search_path = ''
as $$
  update public.reglages set valeur = to_jsonb(coalesce((valeur #>> '{}')::integer, 0) + 1)
   where cle = 'tiroir'
  returning (valeur #>> '{}')::integer;
$$;

-- Clôture du jour : range tous les tickets ouverts dans la clôture et remet le tiroir à zéro.
create function public.cloturer(p_resume jsonb) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v uuid;
begin
  insert into public.clotures (jour, resume)
  values (coalesce((p_resume ->> 'jour')::date, current_date), p_resume)
  returning id into v;
  update public.tickets set cloture_id = v where cloture_id is null;
  update public.reglages set valeur = '0'::jsonb where cle = 'tiroir';
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array['enregistrer_ticket(jsonb)', 'nouvelle_carte(text)', 'ouvrir_tiroir()', 'cloturer(jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ——— Données de départ ———
insert into public.personnel (id, nom, role, pin, badge, couleur, responsable, ordre) values
  ('marin', 'Marin', 'Caissier', '1111', 1, 'oklch(0.55 0.17 250)', false, 1),
  ('mael', 'Maël', 'Responsable', '102456', 2, 'oklch(0.55 0.17 30)', true, 2);

insert into public.reglages (cle, valeur) values
  ('caisse', '"Caisse 1"'),
  ('fond', '2000'),
  ('tiroir', '0');

insert into public.cartes (num, nom, tampons) values (42, 'Mamie Jo', 7);

insert into public.articles (id, rayon, ppp, nom, prix, vente, ean) values
  ('p1', 1, 1, 'Bananes', 200, 'kg', null),
  ('p2', 1, 2, 'Pommes du jardin', 40, 'piece', null),
  ('p3', 1, 3, 'Poires', 45, 'piece', null),
  ('p4', 1, 4, 'Raisin', 350, 'kg', null),
  ('p5', 1, 5, 'Clémentines', 280, 'kg', null),
  ('p6', 1, 6, 'Kiwis', 30, 'piece', null),
  ('p7', 1, 7, 'Fraises', 250, 'barq', null),
  ('p8', 1, 8, 'Citron', 35, 'piece', null),
  ('p9', 2, 1, 'Carottes', 190, 'kg', null),
  ('p10', 2, 2, 'Tomates', 290, 'kg', null),
  ('p11', 2, 3, 'Pommes de terre', 150, 'kg', null),
  ('p12', 2, 4, 'Courgettes', 220, 'kg', null),
  ('p13', 2, 5, 'Concombre', 80, 'piece', null),
  ('p14', 2, 6, 'Salade', 100, 'piece', null),
  ('p15', 2, 7, 'Avocat', 90, 'piece', null),
  ('p16', 2, 8, 'Poireaux', 260, 'kg', null),
  ('p17', 3, 1, 'Baguette', 110, 'piece', null),
  ('p18', 3, 2, 'Croissant', 95, 'piece', null),
  ('p19', 3, 3, 'Pain au chocolat', 105, 'piece', null),
  ('p20', 3, 4, 'Gâteau maison', 137, 'piece', null),
  ('p21', 3, 5, 'Pain de mie', 189, 'piece', '3029330001898'),
  ('p22', 4, 1, 'Lait demi-écrémé', 105, 'piece', '3560070001057'),
  ('p23', 4, 2, 'Yaourts nature ×4', 165, 'piece', '3560070001651'),
  ('p24', 4, 3, 'Beurre doux', 245, 'piece', '3560070002450'),
  ('p25', 4, 4, 'Emmental râpé', 219, 'piece', '3560070002191'),
  ('p26', 4, 5, 'Œufs ×6', 230, 'piece', null),
  ('p27', 5, 1, 'Compote pomme', 160, 'piece', '3564700001608'),
  ('p28', 5, 2, 'Biscuits chocolat', 145, 'piece', '3564700001455'),
  ('p29', 5, 3, 'Madeleines', 199, 'piece', '3564700001998'),
  ('p30', 5, 4, 'Crêpe maison', 50, 'piece', null),
  ('p31', 6, 1, 'Jus d''orange', 210, 'piece', '3250390002109'),
  ('p32', 6, 2, 'Eau 1,5 L', 45, 'piece', '3250390000457'),
  ('p33', 6, 3, 'Sirop de grenadine', 259, 'piece', '3250390002598'),
  ('p34', 6, 4, 'Limonade', 135, 'piece', '3250390001355'),
  ('p35', 7, 1, 'Éponges ×3', 120, 'piece', '3540100001202'),
  ('p36', 7, 2, 'Papier toilette', 350, 'piece', '3540100003503'),
  ('p37', 7, 3, 'Liquide vaisselle', 179, 'piece', '3540100001790'),
  ('p38', 7, 4, 'Bougie maison', 300, 'piece', null),
  ('p39', 8, 1, 'Billes (sachet)', 100, 'piece', null),
  ('p40', 8, 2, 'Dessin de Marin', 50, 'piece', null),
  ('p41', 8, 3, 'Bracelet de Maël', 150, 'piece', null),
  ('p42', 8, 4, 'Petite voiture', 299, 'piece', '3760120002991');
