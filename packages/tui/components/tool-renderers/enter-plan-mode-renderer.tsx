import React from "react";
import { Box, Text } from "ink";
import type { ToolRendererProps } from "../../lib/render-tool";
import { ToolSpinner, getDotColor } from "./shared";

export function EnterPlanModeRenderer({
  part,
  state,
}: ToolRendererProps<"tool-enter_plan_mode">) {
  const isStreaming = part.state === "input-streaming";
  const dotColor = getDotColor(state);

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box>
        {isStreaming ? <ToolSpinner /> : <Text color={dotColor}>● </Text>}
        <Text bold color={state.denied ? "red" : "white"}>
          Entering plan mode
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
