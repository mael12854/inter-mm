/* Connexion à Supabase (projet « Inter-Marin-et-Maël »).
   La clé publishable est faite pour être dans le navigateur : les données sont
   protégées par les règles d'accès de la base (seul le compte du magasin y a accès).
   Laisser url vide pour utiliser la caisse sans Supabase (données dans le navigateur seulement). */
window.CAISSE_CONFIG = {
  url: 'https://peintuxsffdnuadvuxgj.supabase.co',
  key: 'sb_publishable_JXw4Nxb7xy4HXOvR2NXYmA_Ke71GTnl',

  /* Paiement par Crédit Domestique (projet « Credit-Domestique »).
     company = le compte « entreprise » du magasin qui reçoit l'argent. */
  credit: {
    url: 'https://zalvstnzvxdcibnbdbwm.supabase.co',
    key: 'sb_publishable_DR7KL1dgiv-y1wTXnA1X8Q_aeLSQ50H',
    company: 'inter-marin-et-mael'
  }
};
