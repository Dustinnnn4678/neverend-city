# Staging site and backups

## Staging (a safe copy to test on)
GitHub Pages gives one site per repository, so staging is a second copy:
1. Create a second GitHub repository named `neverend-city-staging` (ask Claude to do it; it uses your logged-in GitHub).
2. Create a second **free Supabase project** named `neverend-city-staging`. Run the SQL files in this order: `schema.sql`, `seed.sql`, `payments.sql`, `tycoon.sql`, `community.sql`.
3. In the staging repo, `config.js` points at the staging Supabase project and the Stripe **test** links.
4. Workflow: Claude pushes changes to **staging** first. You open `https://dustinnnn4678.github.io/neverend-city-staging/`, test, and say "approved". Only then Claude copies the same files to the live repo.
Never run the load test or "Reset beta data" against the live project.

## Backups
- Supabase **Pro** plan ($25/month) includes daily backups and point-in-time restore. Worth it once real players exist.
- Free alternative: `.github/workflows/backup.yml` makes an **encrypted** database dump on demand. It is switched off by default because a dump contains emails. To use it: add repository secrets `SUPABASE_DB_URL` (Supabase → Project Settings → Database → Connection string, "URI") and `BACKUP_PASSPHRASE`, and store the downloaded file somewhere private. Do not make it run on a schedule in a public repository until the dump goes to a private place.
- **Test the restore once**: create the staging project, then restore the dump into it with `psql "$STAGING_DB_URL" < backup.sql` (after decrypting with `openssl enc -d -aes-256-cbc -pbkdf2 -in backup.sql.enc -out backup.sql`) and check that the city loads.
