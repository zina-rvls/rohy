// Copie les fichiers web statiques dans www/, le dossier que Capacitor
// embarque dans les projets natifs iOS/Android (cf. webDir dans
// capacitor.config.json). Le site déployé sur GitHub Pages continue de
// servir directement depuis la racine du dépôt — ce script ne change rien
// à ce déploiement, il ne fait qu'alimenter le build natif.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const wwwDir = path.join(root, 'www');

const filesToCopy = ['index.html', 'manifest.json'];
const dirsToCopy = ['assets', 'scripts', 'styles'];

fs.rmSync(wwwDir, { recursive: true, force: true });
fs.mkdirSync(wwwDir, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

for (const file of filesToCopy) {
  copyRecursive(path.join(root, file), path.join(wwwDir, file));
}
for (const dir of dirsToCopy) {
  copyRecursive(path.join(root, dir), path.join(wwwDir, dir));
}

console.log('www/ généré (' + filesToCopy.concat(dirsToCopy).join(', ') + ').');
