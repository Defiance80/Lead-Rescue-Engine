// Builds an importable n8n workflow with the agent's private URLs filled in.
// In n8n: Workflows → Import from File. Then add your Twilio + Gmail credentials.

export function n8nWorkflow(base: string, token: string) {
  const intake = `${base}/api/intake/${token}`;
  const outbox = `${base}/api/outbox/${token}`;
  const report = (status: "sent" | "failed") =>
    `={{ JSON.stringify({ touchId: $('One message at a time').item.json.touchId, status: '${status}'${status === "failed" ? ", error: $json.error?.message ?? 'Send failed'" : ""} }) }}`;

  const http = (name: string, position: [number, number], parameters: Record<string, unknown>) => ({
    id: name.toLowerCase().replace(/[^a-z]+/g, "-"),
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
    parameters,
  });

  const nodes = [
    {
      id: "new-lead",
      name: "New lead (webhook)",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      webhookId: "lead-rescue-new-lead",
      parameters: { httpMethod: "POST", path: "new-lead", responseMode: "onReceived", options: {} },
    },
    http("Send to Lead Rescue", [260, 0], {
      method: "POST",
      url: intake,
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.body ?? $json) }}",
      options: {},
    }),
    {
      id: "every-5-min",
      name: "Every 5 minutes",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 300],
      parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } },
    },
    http("Get due messages", [260, 300], { method: "GET", url: outbox, options: {} }),
    {
      id: "split",
      name: "One message at a time",
      type: "n8n-nodes-base.splitOut",
      typeVersion: 1,
      position: [520, 300],
      parameters: { fieldToSplitOut: "messages", options: {} },
    },
    {
      id: "text-or-email",
      name: "Text or email?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [780, 300],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: "is-sms",
              leftValue: "={{ $json.channel }}",
              rightValue: "sms",
              operator: { type: "string", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
    },
    {
      id: "twilio",
      name: "Send text (Twilio)",
      type: "n8n-nodes-base.twilio",
      typeVersion: 1,
      position: [1040, 200],
      onError: "continueErrorOutput",
      parameters: { from: "+1YOURTWILIONUMBER", to: "={{ $json.to }}", message: "={{ $json.body }}", options: {} },
    },
    {
      id: "gmail",
      name: "Send email (Gmail)",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      position: [1040, 420],
      onError: "continueErrorOutput",
      parameters: { sendTo: "={{ $json.to }}", subject: "={{ $json.subject }}", emailType: "text", message: "={{ $json.body }}", options: {} },
    },
    http("Report sent", [1320, 260], { method: "POST", url: outbox, sendBody: true, specifyBody: "json", jsonBody: report("sent"), options: {} }),
    http("Report failed", [1320, 460], { method: "POST", url: outbox, sendBody: true, specifyBody: "json", jsonBody: report("failed"), options: {} }),
  ];

  const to = (node: string) => [{ node, type: "main", index: 0 }];
  const connections = {
    "New lead (webhook)": { main: [to("Send to Lead Rescue")] },
    "Every 5 minutes": { main: [to("Get due messages")] },
    "Get due messages": { main: [to("One message at a time")] },
    "One message at a time": { main: [to("Text or email?")] },
    "Text or email?": { main: [to("Send text (Twilio)"), to("Send email (Gmail)")] },
    "Send text (Twilio)": { main: [to("Report sent"), to("Report failed")] },
    "Send email (Gmail)": { main: [to("Report sent"), to("Report failed")] },
  };

  return {
    name: "Lead Rescue Engine",
    nodes,
    connections,
    settings: { executionOrder: "v1" },
    pinData: {},
  };
}
