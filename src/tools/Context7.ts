import { HostedMCPTool, hostedMcpTool } from "@openai/agents";
import { CONTEXT7_API_KEY } from "../environment";

// const context7_tool = hostedMcpTool({
//         "type": "mcp",
//         "server_label": "context7",
//         "server_url": "https://mcp.context7.com/mcp",
//         // Basic usage works without auth; for higher rate limits, pass your key here.
//         ...(
//             {"authorization": `Bearer ${CONTEXT7_API_KEY}`}
//             if (typeof CONTEXT7_API_KEY !== "undefined")
//             else {}
//         ),
//         "require_approval": "never",
//     }
// )

export const context7ToolAction = hostedMcpTool({
    serverLabel: 'context8',
    serverUrl: 'https://mcp.context7.com/mcp',
    authorization: `Bearer ${CONTEXT7_API_KEY}`,
    requireApproval: 'never',
})