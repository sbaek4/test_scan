import { useEffect, useMemo, useState } from "react";

interface JobRow {
  id: string;
  job_key: string;
  status: "queued" | "running" | "succeeded" | "failed";
  branch: string;
  owner: string;
  name: string;
  commit_sha: string;
  queued_at: string;
  finished_at: string | null;
  summary: { total: number; low: number; medium: number; high: number; critical: number } | null;
}

function statusColor(status: JobRow["status"]) {
  if (status === "succeeded") return "#198754";
  if (status === "failed") return "#dc3545";
  if (status === "running") return "#fd7e14";
  return "#0d6efd";
}

function severityBadgeColor(totalFindings: number) {
  if (totalFindings > 0) return "#dc3545";
  return "#198754";
}

function timelineText(job: JobRow) {
  const queued = new Date(job.queued_at).toLocaleTimeString();
  const finished = job.finished_at ? new Date(job.finished_at).toLocaleTimeString() : "pending";
  if (job.status === "queued") return `Queued ${queued} -> Waiting for worker`;
  if (job.status === "running") return `Queued ${queued} -> Running`;
  if (job.status === "failed") return `Queued ${queued} -> Failed at ${finished}`;
  return `Queued ${queued} -> Finished at ${finished}`;
}

export function App() {
  const title = useMemo(() => "Webhook Security Scan Dashboard", []);
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL ?? "/api", []);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/jobs`);
        if (!res.ok) throw new Error(`jobs request failed: ${res.status}`);
        const data = (await res.json()) as JobRow[];
        if (active) {
          setJobs(data);
          setError(null);
        }
      } catch (e) {
        if (active) {
          setJobs([]);
          setError(String(e));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void tick();
    const interval = setInterval(() => void tick(), 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", margin: 24 }}>
      <h1>{title}</h1>
      <p>Live process view for incoming webhook scan jobs.</p>
      <p>
        API health: <a href={`${apiBase}/health`}>/health</a> | DB health: <a href={`${apiBase}/health/db`}>/health/db</a>
      </p>
      {error ? <p style={{ color: "#dc3545" }}>Dashboard fetch error: {error}</p> : null}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div>Queued: {jobs.filter((j) => j.status === "queued").length}</div>
        <div>Running: {jobs.filter((j) => j.status === "running").length}</div>
        <div>Succeeded: {jobs.filter((j) => j.status === "succeeded").length}</div>
        <div>Failed: {jobs.filter((j) => j.status === "failed").length}</div>
        <div>{loading ? "Refreshing..." : "Live"}</div>
      </div>
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Repo</th>
            <th>Branch</th>
            <th>Commit</th>
            <th>Status</th>
            <th>Findings</th>
            <th>Timeline</th>
            <th>Queued</th>
            <th>Finished</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{job.owner}/{job.name}</td>
              <td>{job.branch}</td>
              <td><code>{job.commit_sha.slice(0, 12)}</code></td>
              <td>
                <span style={{ color: statusColor(job.status), fontWeight: 700 }}>{job.status}</span>
              </td>
              <td>
                {job.summary ? (
                  <span
                    style={{
                      display: "inline-block",
                      minWidth: 28,
                      textAlign: "center",
                      borderRadius: 999,
                      padding: "2px 8px",
                      color: "white",
                      background: severityBadgeColor(job.summary.total)
                    }}
                    title={`L:${job.summary.low} M:${job.summary.medium} H:${job.summary.high} C:${job.summary.critical}`}
                  >
                    {job.summary.total}
                  </span>
                ) : (
                  "-"
                )}
              </td>
              <td style={{ fontSize: 12, color: "#555" }}>{timelineText(job)}</td>
              <td>{new Date(job.queued_at).toLocaleTimeString()}</td>
              <td>{job.finished_at ? new Date(job.finished_at).toLocaleTimeString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
