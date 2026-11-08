# Fletes Enki — Guía rápida de ramas y despliegue

> **Resumen:**
>
> * `main` = rama del **cliente** (producción estable).
> * `develop` = rama de **desarrollo** (integración continua de features).
> * `feature/xxx` = rama por **funcionalidad específica**.
>
> Las features se mergean a `develop` y se despliegan automáticamente en el ambiente de desarrollo: [https://fletes-enki.netlify.app/schedule.html?dni=37790599](https://fletes-enki.netlify.app/schedule.html?dni=37790599)

---

## Ramas

* **main**

  * Código estable, listo para producción/cliente.
  * Protegida (sin commits directos; solo vía PRs).

* **develop**

  * Rama de integración: aquí se unen las features.
  * Despliegue automático al **ambiente de desarrollo**.

* **feature/xxx**

  * Una rama por funcionalidad/tarea.
  * Convención sugerida: `feature/<id-tarea>-<slug-corto>`

    * Ej.: `feature/123-filtro-por-fecha`.

> **Opcionales para escalar:**
>
> * **hotfix/xxx**: para parches urgentes basados en `main` (se mergea a `main` y luego **back-merge** a `develop`).
> * **release/xxx**: congelar versiones antes de pasar a producción (permite QA final y fixes menores).

---

## Flujo de trabajo (GitFlow-lite)

```text
feature/xxx  --->  develop  --->  main
     \           (deploy dev)   (release prod)
      \_ PR --->
```

1. Crear rama de feature desde `develop`:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/123-filtro-por-fecha
```

2. Commits pequeños y descriptivos. Opcional: referencia de tarea (e.g., `[#123]`).

3. Abrir **Pull Request** de `feature/xxx` → `develop`.

   * Revisión + checks de CI.
   * Merge con **Squash** o **Merge commit** (consistente para todo el repo).

4. Al mergearse en `develop`, Netlify despliega el **ambiente de desarrollo**:

   * URL: [https://fletes-enki.netlify.app/schedule.html?dni=37790599](https://fletes-enki.netlify.app/schedule.html?dni=37790599)

5. Para publicar al cliente:

   * (Opcional) Crear `release/x.y.z` desde `develop`, validar, y luego PR → `main`.
   * O directamente PR de `develop` → `main` si el proceso es simple.

---


## Comandos para exportar base de datos de prod e importalos en dev
# DESDE PS C:\Users\leanm\OneDrive\Desktop\Lean\Proyects\fletenki_v2\firestore-sync>
# Desde PowerShell

## PROD EXPORT
node .\firebase\export-firestore.cjs --creds ".\firebase\sa_prod.json" --out ".\firebase\firestore-backup.json"

## DEV IMPORT
node .\firebase\export-firestore.cjs --creds ".\firebase\sa_prod.json" --out ".\firebase\firestore-backup.json"

---

## Caché del navegador (versión de CSS/JS)

Los HTML piden los CSS y JS con un número de versión, por ejemplo `styles/styles.css?v=20261108`.
Así, cuando se sube un cambio, los usuarios bajan el archivo nuevo sin tener que borrar la caché.

**Cada vez que se publique un cambio en CSS o JS**, actualizar el número en todos los HTML (usar la fecha del día):

```bash
# macOS (en Linux/Git Bash: sed -i sin las comillas vacías)
sed -i '' -E 's/\?v=[0-9]+/?v=AAAAMMDD/g' *.html
```

En el servidor de producción (Apache), el archivo `.htaccess` hace que el navegador siempre consulte si hay un HTML nuevo.
Al subir archivos al servidor, **incluir siempre los HTML** (y el `.htaccess` la primera vez).
