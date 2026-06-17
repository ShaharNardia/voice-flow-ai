# Forking into a dedicated product (e.g. `voiceflow-health`)

Goal: a **separate repository + separate Firebase/GCP project** so the
healthcare / on-prem product evolves independently and can NEVER deploy to or
break the current `voice-flow-ai` production. Reuses the env-aware deploy
machinery and the staging-setup pattern already in this repo.

> Placeholder name below: **`voiceflow-health`** (repo) / **`voiceflow-health`**
> (GCP project id). Pick your real names and substitute everywhere.

---

## Part A — things only you can do (console / GitHub admin)

1. **Create the GitHub repo** (empty, no README):
   `https://github.com/new` → name `voiceflow-health` → Private → Create.
2. **Create the Firebase project** `voiceflow-health` + enable **Blaze billing**
   (same steps as `docs/STAGING.md` §1–§3: APIs, Firestore us-central1, Auth).
   Optionally also create `voiceflow-health-staging` for its own staging lane.
3. Tell me the repo URL + project id(s). I do Part B.

## Part B — I execute once A exists (clone + rebrand, scripted)

```bash
# 1. Full copy WITH history (run from the parent dir)
git clone https://github.com/ShaharNardia/voice-flow-ai.git voiceflow-health
cd voiceflow-health
git remote set-url origin https://github.com/<you>/voiceflow-health.git
```

Then I apply the **product-identity rebrand** (one focused commit):

- `.firebaserc` → only the NEW project(s). **Remove the original prod project id
  entirely** so a stray `deploy production` here can never hit `voice-flow-ai`.
- `saas-frontend/.env.production` / `.env.staging` → the new project's web config.
- `scripts/deploy.sh` → `PROJECT` map points only at the new projects; the
  `RUN_SERVICE` stays `voiceflow-mediastream` (separate project = isolated).
- `package.json` names, app title/branding, `docs/` headers.
- New `ci-secrets/` (fresh deploy SA keys for the new project) + its own GitHub
  secrets + `production` environment — same recipe as `docs/CICD.md`.
- Copy provider secrets into the new project (Secret Manager + Cloud Run env)
  using the same `gcloud secrets versions access … | gcloud secrets create …`
  copy pattern we used for staging (or use fresh/test keys for isolation).

```bash
git add -A && git commit -m "fork: rebrand to voiceflow-health dedicated product"
git push -u origin main
```

## Part C — first deploy of the fork
Identical to this repo's flow (now pointing at the new project):
```bash
scripts/deploy.sh staging all          # if you made a staging lane
scripts/deploy.sh production all --yes
```

---

## What the fork inherits for free
- The whole codebase incl. the **flag-gated Clalit work** (`healthcare_config.js`,
  `clinical_safety_service.js`, WP0/WP1). In the fork you can flip
  `healthcareCompliance.enabled` ON by default for the product.
- The env-aware deploy script, per-env config, CI/CD pattern.

## Divergence discipline (the real cost of a fork)
- **Shared fixes back-port manually.** Keep `voice-flow-ai` as the `upstream`
  remote in the fork (`git remote add upstream …`) and cherry-pick/merge core
  fixes. Decide an owner for "what's shared vs product-specific."
- Consider keeping **truly shared** code (e.g. `cloud-run/mediastream`,
  `clinical_safety_service.js`) in sync via cherry-pick rather than letting both
  drift — the voice engine especially.

## Why not just flags?
You chose a hard fork for full product independence (separate compliance,
on-prem target, separate roadmap). That's valid — just go in eyes-open about the
two-codebase maintenance tax. If the products turn out to stay 90% identical,
collapsing back to flags-in-one-repo later is also possible.
