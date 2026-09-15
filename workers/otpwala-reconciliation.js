const RECONCILIATION_URL = "https://otpwala.me/api/cron/reconcile";

async function runReconciliation(env) {
  if (!env.CRON_SECRET) {
    throw new Error("Missing CRON_SECRET Worker secret");
  }

  const response = await fetch(RECONCILIATION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      "User-Agent": "otpwala-reconciliation-worker/1.0",
    },
  });

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Reconciliation failed with HTTP ${response.status}: ${responseBody}`,
    );
  }

  return responseBody;
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runReconciliation(env));
  },

  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OTPWala reconciliation worker is running", {
        status: 200,
      });
    }

    const authorization = request.headers.get("Authorization");
    if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`) {
      return Response.json({ success: false, error: "Unauthorized" }, {
        status: 401,
      });
    }

    try {
      const responseBody = await runReconciliation(env);
      return new Response(responseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : "Reconciliation failed",
      }, { status: 502 });
    }
  },
};
