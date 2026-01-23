import React from "react";
import { Box, Text } from "ink";
import type { ToolRendererProps } from "../../lib/render-tool";
import { ToolSpinner, getDotColor } from "./shared";

export function ExitPlanModeRenderer({
  part,
  state,
}: ToolRendererProps<"tool-exit_plan_mode">) {
  const isStreaming = part.state === "input-streaming";
  const dotColor = getDotColor(state);

  // Check if tool executed successfully
  const isCompleted =
    part.state === "output-available" &&
    typeof part.output === "object" &&
    part.output !== null &&
    "success" in part.output &&
    part.output.success === true;

  // Check if there was an actual plan
  const hasPlan =
    isCompleted &&
    "plan" in part.output &&
    typeof part.output.plan === "string" &&
    part.output.plan.trim().length > 0;

  // Determine text based on state
  let text: string;
  let textColor: string;

  if (state.denied) {
    text = "Plan rejected";
    textColor = "red";
  } else if (isCompleted) {
    text = hasPlan ? "Plan approved" : "Exited plan mode";
    textColor = "green";
  } else {
    text = "Plan complete. Requesting approval to proceed.";
    textColor = "white";
  }

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box>
        {isStreaming ? <ToolSpinner /> : <Text color={dotColor}>● </Text>}
        <Text bold color={textColor}>
          {text}
        </Text>
      </Box>

      {state.denied && (
        <Box paddingLeft={2}>
          <Text color="gray">└ </Text>
          <Text color="red">
            Denied{state.denialReason ? `: ${state.denialReason}` : ""}
          </Text>
        </Box>
      )}
    </Box>
  );
}
