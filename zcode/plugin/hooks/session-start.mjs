// ZCode owns tool exposure and permissions; this hook only supplies guidance.
export const guidance = `Diffusion Mode · ZCode native compatibility
Use tools already exposed to this request directly. Discover additional capabilities only when needed, and load the exact tools required for the task.
Use the search control actually exposed by ZCode: ToolSearch in native mode, or LocalToolSearch in local mode. For known names use {"query":"select:<exact_name>","max_results":1}; for unknown names use concise keywords and a small max_results. Search loads schemas and does not execute the target tool.
After ToolSearch, call the loaded tool directly. After LocalToolSearch, call deferred tools through DeferredToolCall {name,input}, using the returned schema; resident tools remain direct calls. Follow ZCode's actual tool descriptions and permissions.
The /call-directory command helps browse names and plan exact selections. It is a slash command, not a registered call_directory tool. Load the diffusion skill for detailed migration guidance only when useful.
If neither search control is exposed, use the currently available tools normally; ToolSearch can be enabled in ZCode Settings. This compatibility plugin cannot change the initial tool set, unload/reset tool exposure, or provide DSH run_code/PTC. Never claim otherwise. Workspace/user instructions and host permissions remain in force.`;

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
try {
  const input = JSON.parse(raw);
  if ((input.hook_event_name ?? input.hookEventName) === 'SessionStart') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: guidance },
    }) + '\n');
  }
} catch (error) {
  process.stderr.write(`[diffusion] Invalid hook input: ${error.message}\n`);
  process.exitCode = 1;
}
