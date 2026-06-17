# CI/CD Pipeline

GitHub Actions deploys automatically, matching the flow:

```
  feature branch ──PR──▶ staging ──(push)──▶  🤖 auto-deploy to STAGING
                            │
                            └──PR──▶ main ──(merge)──▶ ⏸ manual approval ──▶ 🤖 deploy to PRODUCTION
```

- **Push to `staging`** → [`deploy-staging.yml`](../.github/workflows/deploy-staging.yml) deploys the whole stack to `voiceflow-staging`. No gate — break it freely.
- **Merge a `staging → main` PR** → [`deploy-production.yml`](../.github/workflows/deploy-production.yml) runs, but **pauses on the `production` environment** until you approve it in the GitHub UI.
- Both reuse `scripts/deploy.sh <env> all`, so CI and manual deploys never drift.
- The existing [`ci.yml`](../.github/workflows/ci.yml) still lint/build/tests every PR.

---

## One-time setup (repo admin — `gh` here only has read access)

### 1. Add the 4 repository secrets
GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**.
Paste the **contents** of each staged file from `ci-secrets/` (gitignored):

| Secret name | Paste contents of |
|---|---|
| `GCP_SA_KEY_STAGING` | `ci-secrets/GCP_SA_KEY_STAGING.json` |
| `GCP_SA_KEY_PROD` | `ci-secrets/GCP_SA_KEY_PROD.json` |
| `FUNCTIONS_ENV_STAGING` | `ci-secrets/FUNCTIONS_ENV_STAGING.txt` |
| `FUNCTIONS_ENV_PROD` | `ci-secrets/FUNCTIONS_ENV_PROD.txt` |

Or, from your admin account with `gh`:
```bash
gh secret set GCP_SA_KEY_STAGING    < ci-secrets/GCP_SA_KEY_STAGING.json
gh secret set GCP_SA_KEY_PROD       < ci-secrets/GCP_SA_KEY_PROD.json
gh secret set FUNCTIONS_ENV_STAGING < ci-secrets/FUNCTIONS_ENV_STAGING.txt
gh secret set FUNCTIONS_ENV_PROD    < ci-secrets/FUNCTIONS_ENV_PROD.txt
```
**Then delete the folder:** `rm -rf ci-secrets` (the keys live in GitHub now).

### 2. Create the `production` environment (the approval gate)
Settings → **Environments → New environment** → name it **`production`** →
enable **Required reviewers** and add **yourself** → Save.
That's what makes the prod deploy wait for your click.

### 3. Land the workflows on `main`, then create `staging`
```bash
git add .github scripts/deploy.sh .firebaserc saas-frontend/.env.* docs
git commit -m "ci: env-aware deploy + staging/prod GitHub pipelines"
git push origin HEAD                       # push this branch, open PR → main, merge
# after merge:
git checkout main && git pull
git checkout -b staging && git push -u origin staging
```
(The workflow files must exist on each branch that triggers them — `staging` for
the staging pipeline, `main` for production.)

---

## Daily flow
1. Work on a feature branch → PR into **`staging`** (CI runs).
2. Merge → **staging auto-deploys** → test at https://voiceflow-staging.web.app
3. When happy, open PR **`staging → main`**, merge it.
4. The production deploy starts and **waits** → approve it in
   **Actions → Deploy Production → Review deployments**.

## Service accounts
- `gh-deployer@voiceflow-staging` / `gh-deployer@voiceflow-ai-202509231639`
- Roles: firebase.admin, run.admin, cloudfunctions.admin, cloudbuild.builds.editor,
  artifactregistry.admin, iam.serviceAccountUser, secretmanager.admin,
  serviceusage.serviceUsageConsumer.
- **Key rotation:** regenerate with `gcloud iam service-accounts keys create`,
  update the GitHub secret, delete the old key. (Hardening: migrate to Workload
  Identity Federation to drop long-lived keys — the keyless path.)
