import React, { memo } from "react";
import { Box, Text } from "ink";

export type Suggestion = {
  value: string;
  display: string;
  isDirectory?: boolean;
};

type SuggestionsProps = {
  suggestions: Suggestion[];
  selectedIndex: number;
  visible: boolean;
};

export const Suggestions = memo(function Suggestions({
  suggestions,
  selectedIndex,
  visible
}: SuggestionsProps) {
  if (!visible || suggestions.length === 0) {
    return null;
  }

  // Limit displayed suggestions
  const maxDisplay = 10;
  const displayedSuggestions = suggestions.slice(0, maxDisplay);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
      marginTop={0}
    >
      {displayedSuggestions.map((suggestion, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={suggestion.value}>
            <Text
              color={isSelected ? "black" : suggestion.isDirectory ? "cyan" : "white"}
              backgroundColor={isSelected ? "white" : undefined}
            >
              {suggestion.display}
            </Text>
          </Box>
        );
      })}
      {suggestions.length > maxDisplay && (
        <Text color="gray" dimColor>
          ...and {suggestions.length - maxDisplay} more
        </Text>
      )}
    </Box>
  );
});
