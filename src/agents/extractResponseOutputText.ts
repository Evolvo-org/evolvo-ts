type ResponsesApiContentItem = {
  type?: string;
  text?: string;
  refusal?: string;
};

type ResponsesApiOutputItem = {
  type?: string;
  content?: ResponsesApiContentItem[];
};

type ResponsesApiResponse = {
  status?: string;
  error?: {
    message?: string;
  } | null;
  incomplete_details?: {
    reason?: string;
  } | null;
  output_text?: unknown;
  output?: ResponsesApiOutputItem[];
};

export function extractResponseOutputText(response: ResponsesApiResponse, agentName: string): string {
  if (response.error?.message) {
    throw new Error(`${agentName} request failed: ${response.error.message}`);
  }

  if (response.status === "failed") {
    throw new Error(`${agentName} request failed without an error message.`);
  }

  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason?.trim();
    throw new Error(
      reason
        ? `${agentName} response was incomplete: ${reason}`
        : `${agentName} response was incomplete.`,
    );
  }

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (contentItem.type === "refusal" && typeof contentItem.refusal === "string" && contentItem.refusal.trim()) {
        throw new Error(`${agentName} response was refused: ${contentItem.refusal.trim()}`);
      }

      if (contentItem.type === "output_text" && typeof contentItem.text === "string" && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
    }
  }

  throw new Error(`${agentName} response did not include assistant output text.`);
}
