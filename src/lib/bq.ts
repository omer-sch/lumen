import "server-only";

import { BigQuery } from "@google-cloud/bigquery";
import { serverEnv } from "@/lib/env.server";

let _bq: BigQuery | null = null;

/**
 * Singleton BigQuery client. The service account JSON arrives base64-encoded
 * via `GOOGLE_APPLICATION_CREDENTIALS_JSON` so it round-trips cleanly through
 * Vercel env vars without quoting hazards.
 */
export function getBigQueryClient(): BigQuery {
  if (_bq) return _bq;

  const credentialsB64 = serverEnv.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (credentialsB64) {
    // Explicit service-account path (production / CI).
    const decoded = Buffer.from(credentialsB64, "base64").toString("utf-8");
    let credentials: { client_email?: string; private_key?: string };
    try {
      credentials = JSON.parse(decoded);
    } catch {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid base64-encoded JSON.",
      );
    }
    _bq = new BigQuery({
      projectId: serverEnv.BQ_PROJECT,
      credentials,
    });
    return _bq;
  }

  // No explicit creds → fall back to Application Default Credentials. Picks
  // up `~/.config/gcloud/application_default_credentials.json` from
  // `gcloud auth application-default login` for local dev, or workload
  // identity / GOOGLE_APPLICATION_CREDENTIALS file path in production.
  _bq = new BigQuery({ projectId: serverEnv.BQ_PROJECT });
  return _bq;
}
