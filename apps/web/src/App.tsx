import { useMemo } from "react";

export function App() {
  const title = useMemo(() => "Webhook Security Scan Dashboard", []);

  return (
    <main style={{ fontFamily: "sans-serif", margin: 24 }}>
      <h1>{title}</h1>
      <p>
        Use this UI to verify the platform is running. API health: <a href="http://localhost:3000/health">/health</a>
      </p>
      <ol>
        <li>Push to <code>sbaek4/test_scan</code></li>
        <li>GitHub sends webhook to API</li>
        <li>API publishes Kafka scan request</li>
        <li>Worker clones repository and stores scan result</li>
      </ol>
    </main>
  );
}
