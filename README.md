# Tiny Universe

Tiny Universe est une PWA contemplative générative.

## Lancer en local
Servez le dossier via un serveur HTTP local, par exemple :

```bash
python3 -m http.server 8000
```

Puis ouvrez `http://localhost:8000`.

## Contrôles
- glisser vers la droite : accélérer le temps
- glisser vers la gauche : ralentir le temps
- tap : troubler l’espace
- bouton ⟲ : réinitialiser l’univers
- volume : régler l’ambiance

## Notes
- fonctionnement offline via service worker
- sauvegarde locale via IndexedDB
- un seul univers par défaut
