import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useChat } from "@ai-sdk/react";
import { useChatContext } from "../chat-context.js";
import { addSessionRule } from "../../agent/utils/shared-context.js";
import type { RuleCandidate } from "./tool-call.js";

export type ApprovalPanelProps = {
  approvalId: string;
  toolType: string;
  toolCommand: string;
  toolDescription?: string;
  dontAskAgainPattern?: string;
  ruleCandidate?: RuleCandidate;
};

export function ApprovalPanel({
  approvalId,
  toolType,
  toolCommand,
  toolDescription,
  dontAskAgainPattern,
  ruleCandidate,
}: ApprovalPanelProps) {
  const { chat } = useChatContext();
  const { addToolApprovalResponse } = useChat({ chat });
  const [selected, setSelected] = useState(0);
  const [reason, setReason] = useState("");
  const hasRuleCandidate = Boolean(ruleCandidate);
  const maxIndex = hasRuleCandidate ? 2 : 1;
  const reasonIndex = hasRuleCandidate ? 2 : 1;

  // Reset state when approval request changes
  useEffect(() => {
    setSelected(0);
    setReason("");
  }, [approvalId]);

  useInput((input, key) => {
    // Handle escape to cancel (deny without reason)
    if (key.escape) {
      addToolApprovalResponse({ id: approvalId, approved: false });
      return;
    }

    // When on the text input option
    if (selected === reasonIndex) {
      if (key.return) {
        addToolApprovalResponse({
          id: approvalId,
          approved: false,
          reason: reason.trim() || undefined,
        });
      } else if (key.backspace || key.delete) {
        setReason((prev) => prev.slice(0, -1));
      } else if (key.upArrow || (key.ctrl && input === "p")) {
        setSelected(hasRuleCandidate ? 1 : 0);
      } else if (input && !key.ctrl && !key.meta && !key.return) {
        setReason((prev) => prev + input);
      }
      return;
    }

    const goUp = key.upArrow || input === "k" || (key.ctrl && input === "p");
    const goDown =
      key.downArrow || input === "j" || (key.ctrl && input === "n");

    if (goUp) {
      setSelected((prev) => (prev === 0 ? maxIndex : prev - 1));
    }
    if (goDown) {
      setSelected((prev) => (prev === maxIndex ? 0 : prev + 1));
    }
    if (key.return) {
      if (selected === 0) {
        // Yes
        addToolApprovalResponse({ id: approvalId, approved: true });
      } else if (hasRuleCandidate && selected === 1 && ruleCandidate) {
        // Yes, and don't ask again - store the rule for future auto-approval
        addSessionRule(ruleCandidate.rule);
        addToolApprovalResponse({ id: approvalId, approved: true });
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor="gray"
      paddingTop={1}
    >
      {/* Tool type header */}
      <Text color="blueBright" bold>
        {toolType}
      </Text>

      {/* Command and description */}
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Text>{toolCommand}</Text>
        {toolDescription && <Text color="gray">{toolDescription}</Text>}
      </Box>

      {/* Question and options */}
      <Box flexDirection="column" marginTop={1}>
        <Text>Do you want to proceed?</Text>
        <Box flexDirection="column" marginTop={1}>
          {/* Option 1: Yes */}
          <Text>
            <Text color="yellow">{selected === 0 ? "› " : "  "}</Text>
            <Text>1. Yes</Text>
          </Text>

          {/* Option 2: Yes, and don't ask again */}
          {hasRuleCandidate && (
            <Text>
              <Text color="yellow">{selected === 1 ? "› " : "  "}</Text>
              <Text>2. Yes, and don't ask again for </Text>
              <Text bold>{ruleCandidate?.displayLabel ?? dontAskAgainPattern}</Text>
            </Text>
          )}

          {/* Option 3: Inline text input */}
          <Box>
            <Text color="yellow">
              {selected === reasonIndex ? "› " : "  "}
            </Text>
            <Text>{hasRuleCandidate ? "3. " : "2. "}</Text>
            {reason || selected === reasonIndex ? (
              <>
                <Text>{reason}</Text>
                {selected === reasonIndex && <Text color="gray">█</Text>}
              </>
            ) : (
              <Text color="gray">Type here to tell Claude what to do differently</Text>
            )}
          </Box>
        </Box>
      </Box>

      {/* Footer hint */}
      <Box marginTop={1}>
        <Text color="gray">
          {selected === reasonIndex ? "Enter to submit, Esc to deny" : "Esc to deny"}
        </Text>
      </Box>
    </Box>
  );
}
