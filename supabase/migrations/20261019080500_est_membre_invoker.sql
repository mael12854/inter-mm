-- Chaque compte peut lire sa propre ligne de public.membres : pas besoin de droits élevés.
alter function public.est_membre() security invoker;
