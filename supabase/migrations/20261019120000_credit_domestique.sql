-- Paiement par Crédit Domestique : montant payé par ce moyen sur chaque ticket (en centimes).
alter table public.tickets add column if not exists credit integer not null default 0;

create or replace function public.enregistrer_ticket(p jsonb) returns public.cartes
language plpgsql security invoker set search_path = ''
as $$
declare
  c public.cartes;
  n integer := coalesce((p ->> 'tampons')::integer, 0);
  carte integer := (p ->> 'num_carte')::integer;
begin
  insert into public.tickets (id, no, statut, ferme_le, jour, caissier, caisse, total, articles, remises,
                              lignes_annulees, especes, carte, credit, num_carte, tampons, detail)
  values ((p ->> 'id')::uuid, (p ->> 'no')::integer, p ->> 'statut',
          coalesce((p ->> 'ferme_le')::timestamptz, now()), coalesce((p ->> 'jour')::date, current_date),
          p ->> 'caissier', p ->> 'caisse',
          coalesce((p ->> 'total')::integer, 0), coalesce((p ->> 'articles')::integer, 0),
          coalesce((p ->> 'remises')::integer, 0), coalesce((p ->> 'lignes_annulees')::integer, 0),
          coalesce((p ->> 'especes')::integer, 0), coalesce((p ->> 'carte')::integer, 0),
          coalesce((p ->> 'credit')::integer, 0),
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
