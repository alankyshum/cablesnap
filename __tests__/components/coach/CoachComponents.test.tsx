import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import {
  CoachComposer,
  CoachConversation,
  CoachEmptyState,
  CoachErrorCard,
  CoachHeader,
  CoachMessageBubble,
  CoachSidebar,
} from "@/components/coach";
import { toChatErrorState } from "@/lib/ai/errors";
import { confirmAction } from "@/lib/confirm";
import type { CoachSession } from "@/lib/db/coach";

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/lib/confirm", () => ({
  confirmAction: jest.fn(),
}));

const mockPush = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({
    push: mockPush,
  });
});

describe("CoachSidebar", () => {
  const sampleSessions: CoachSession[] = [
    {
      id: "session-1",
      title: "Leg Day Progression",
      model_id: "openai/gpt-4o",
      created_at: 1700000000000,
      updated_at: 1700000000000,
    },
    {
      id: "session-2",
      title: "Nutrition Advice",
      model_id: "anthropic/claude-3.5-sonnet",
      created_at: 1699900000000,
      updated_at: 1699900000000,
    },
  ];

  it("renders sessions list and handles selection", () => {
    const onSelectSession = jest.fn();
    const onNewChat = jest.fn();
    const onRenameSession = jest.fn();
    const onDeleteSession = jest.fn();

    const { getByText, getByLabelText } = render(
      <CoachSidebar
        sessions={sampleSessions}
        activeSessionId="session-1"
        onSelectSession={onSelectSession}
        onNewChat={onNewChat}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
      />
    );

    expect(getByText("Conversations")).toBeTruthy();
    expect(getByText("Leg Day Progression")).toBeTruthy();
    expect(getByText("Nutrition Advice")).toBeTruthy();

    fireEvent.press(getByText("Nutrition Advice"));
    expect(onSelectSession).toHaveBeenCalledWith("session-2");

    fireEvent.press(getByLabelText("Start a new chat"));
    expect(onNewChat).toHaveBeenCalled();
  });

  it("handles rename flow", () => {
    const onRenameSession = jest.fn();
    const { getByLabelText, getByPlaceholderText, getByText } = render(
      <CoachSidebar
        sessions={sampleSessions}
        activeSessionId="session-1"
        onSelectSession={jest.fn()}
        onNewChat={jest.fn()}
        onRenameSession={onRenameSession}
        onDeleteSession={jest.fn()}
      />
    );

    fireEvent.press(getByLabelText("Rename Leg Day Progression"));
    expect(getByText("Rename Conversation")).toBeTruthy();

    const input = getByPlaceholderText("Conversation title");
    fireEvent.changeText(input, "Updated Leg Day");
    fireEvent.press(getByLabelText("Save rename"));

    expect(onRenameSession).toHaveBeenCalledWith("session-1", "Updated Leg Day");
  });

  it("handles delete flow with confirmation", () => {
    const onDeleteSession = jest.fn();
    (confirmAction as jest.Mock).mockImplementation((title, message, onConfirm) => {
      onConfirm();
    });

    const { getByLabelText } = render(
      <CoachSidebar
        sessions={sampleSessions}
        activeSessionId="session-1"
        onSelectSession={jest.fn()}
        onNewChat={jest.fn()}
        onRenameSession={jest.fn()}
        onDeleteSession={onDeleteSession}
      />
    );

    fireEvent.press(getByLabelText("Delete Leg Day Progression"));
    expect(confirmAction).toHaveBeenCalled();
    expect(onDeleteSession).toHaveBeenCalledWith("session-1");
  });

  it("renders empty state when session list is empty", () => {
    const onNewChat = jest.fn();
    const { getByText } = render(
      <CoachSidebar
        sessions={[]}
        activeSessionId={null}
        onSelectSession={jest.fn()}
        onNewChat={onNewChat}
        onRenameSession={jest.fn()}
        onDeleteSession={jest.fn()}
      />
    );

    expect(getByText("No conversations yet")).toBeTruthy();
    fireEvent.press(getByText("New Chat"));
    expect(onNewChat).toHaveBeenCalled();
  });
});

describe("CoachHeader", () => {
  it("renders model name and handles picker press", () => {
    const onOpenModelPicker = jest.fn();
    const { getByText, getByLabelText } = render(
      <CoachHeader
        selectedModelId="openai/gpt-4o"
        onOpenModelPicker={onOpenModelPicker}
      />
    );

    expect(getByText("gpt-4o")).toBeTruthy();
    fireEvent.press(getByLabelText("Active Model: openai/gpt-4o. Tap to change model."));
    expect(onOpenModelPicker).toHaveBeenCalled();
  });

  it("renders placeholder when no model selected", () => {
    const onOpenModelPicker = jest.fn();
    const { getByText } = render(
      <CoachHeader
        selectedModelId={null}
        onOpenModelPicker={onOpenModelPicker}
      />
    );

    expect(getByText("Select AI Model")).toBeTruthy();
  });

  it("renders stale catalog badge when stale", () => {
    const onRefreshCatalog = jest.fn();
    const { getByText, getByLabelText } = render(
      <CoachHeader
        selectedModelId="openai/gpt-4o"
        onOpenModelPicker={jest.fn()}
        isStaleCatalog={true}
        onRefreshCatalog={onRefreshCatalog}
      />
    );

    expect(getByText("Cached catalog")).toBeTruthy();
    fireEvent.press(getByLabelText("Catalog is cached. Tap to refresh."));
    expect(onRefreshCatalog).toHaveBeenCalled();
  });
});

describe("CoachErrorCard", () => {
  it("handles missing key error recovery", () => {
    const errorState = toChatErrorState({ kind: "missing_key" });
    const { getByText, getByLabelText } = render(
      <CoachErrorCard error={errorState} />
    );

    expect(getByText(errorState.message)).toBeTruthy();
    fireEvent.press(getByLabelText(errorState.recovery.label));
    expect(mockPush).toHaveBeenCalledWith("/settings/ai-key");
  });

  it("handles insufficient credits external link", async () => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

    const errorState = toChatErrorState({ kind: "insufficient_credits", status: 402 });
    const { getByText, getByLabelText } = render(
      <CoachErrorCard error={errorState} />
    );

    expect(getByText(errorState.message)).toBeTruthy();
    fireEvent.press(getByLabelText(errorState.recovery.label));
    expect(Linking.openURL).toHaveBeenCalledWith("https://openrouter.ai/credits");
  });

  it("handles model_not_in_catalog recovery", () => {
    const onPickModel = jest.fn();
    const errorState = toChatErrorState({ kind: "model_not_in_catalog" });
    const { getByText, getByLabelText } = render(
      <CoachErrorCard error={errorState} onPickModel={onPickModel} />
    );

    expect(getByText(errorState.message)).toBeTruthy();
    fireEvent.press(getByLabelText(errorState.recovery.label));
    expect(onPickModel).toHaveBeenCalled();
  });

  it("handles network error retry", () => {
    const onRetry = jest.fn();
    const errorState = toChatErrorState({ kind: "network_error" });
    const { getByText, getByLabelText } = render(
      <CoachErrorCard error={errorState} onRetry={onRetry} />
    );

    expect(getByText(errorState.message)).toBeTruthy();
    fireEvent.press(getByLabelText(errorState.recovery.label));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("CoachComposer", () => {
  it("disables send button when empty and enables on typing", () => {
    const onSend = jest.fn();
    const onChangeText = jest.fn();

    const { getByLabelText, rerender } = render(
      <CoachComposer
        value=""
        onChangeText={onChangeText}
        onSend={onSend}
      />
    );

    const sendButton = getByLabelText("Send message");
    fireEvent.press(sendButton);
    expect(onSend).not.toHaveBeenCalled();

    rerender(
      <CoachComposer
        value="What is my max volume?"
        onChangeText={onChangeText}
        onSend={onSend}
      />
    );

    fireEvent.press(sendButton);
    expect(onSend).toHaveBeenCalled();
  });

  it("renders stop button when streaming", () => {
    const onStop = jest.fn();
    const { getByLabelText } = render(
      <CoachComposer
        value="Thinking"
        onChangeText={jest.fn()}
        onSend={jest.fn()}
        onStop={onStop}
        isStreaming={true}
      />
    );

    const stopButton = getByLabelText("Stop generating");
    fireEvent.press(stopButton);
    expect(onStop).toHaveBeenCalled();
  });
});

describe("CoachMessageBubble", () => {
  it("renders user message", () => {
    const { getByText } = render(
      <CoachMessageBubble
        message={{
          role: "user",
          content: "How is my bench progress?",
          created_at: 1700000000000,
        }}
      />
    );

    expect(getByText("How is my bench progress?")).toBeTruthy();
  });

  it("renders assistant message with in-flight tool indicator", () => {
    const { getByText } = render(
      <CoachMessageBubble
        message={{
          role: "assistant",
          content: "Let me check your stats...",
        }}
        isStreaming={true}
        inFlightTool="recent_sessions"
      />
    );

    expect(getByText("Reading workout history...")).toBeTruthy();
    expect(getByText("Let me check your stats...")).toBeTruthy();
    expect(getByText("Thinking...")).toBeTruthy();
  });

  it("renders assistant message with persisted tool badge", () => {
    const { getByText } = render(
      <CoachMessageBubble
        message={{
          role: "assistant",
          content: "Your bench increased 5kg this month.",
          tool_calls: '[{"name":"exercise_history"}]',
        }}
      />
    );

    expect(getByText("Data consulted: local records")).toBeTruthy();
    expect(getByText("Your bench increased 5kg this month.")).toBeTruthy();
  });
});

describe("CoachConversation", () => {
  it("does not render another session's streaming reply", () => {
    const props = {
      messages: [{ id: "message-1", session_id: "session-b", role: "user", content: "Hello", tool_calls: null, error: null, created_at: 1 }],
      activeSessionId: "session-b",
      selectedModelId: "provider/model",
      isMissingKey: false,
      isStreaming: true,
      streamingSessionId: "session-a",
      streamingText: "Reply from session A",
      inFlightTool: null,
      activeError: null,
      inputText: "",
      onChangeInputText: jest.fn(),
      onSend: jest.fn(),
      onStop: jest.fn(),
      onOpenModelPicker: jest.fn(),
      onDismissError: jest.fn(),
    };
    const { queryByText } = render(<CoachConversation {...props} />);

    expect(queryByText("Reply from session A")).toBeNull();
  });
});

describe("CoachEmptyState", () => {
  it("renders missing key card with add key button", () => {
    const { getByText } = render(
      <CoachEmptyState
        isMissingKey={true}
        selectedModelId="openai/gpt-4o"
        onOpenModelPicker={jest.fn()}
        onSelectPrompt={jest.fn()}
      />
    );

    expect(getByText("API Key Required")).toBeTruthy();
    fireEvent.press(getByText("Add Key"));
    expect(mockPush).toHaveBeenCalledWith("/settings/ai-key");
  });

  it("renders select model card when no model is selected", () => {
    const onOpenModelPicker = jest.fn();
    const { getByText } = render(
      <CoachEmptyState
        isMissingKey={false}
        selectedModelId={null}
        onOpenModelPicker={onOpenModelPicker}
        onSelectPrompt={jest.fn()}
      />
    );

    expect(getByText("Select an AI Model")).toBeTruthy();
    fireEvent.press(getByText("Select Model"));
    expect(onOpenModelPicker).toHaveBeenCalled();
  });

  it("renders prompt suggestions when key and model are ready", () => {
    const onSelectPrompt = jest.fn();
    const { getByText } = render(
      <CoachEmptyState
        isMissingKey={false}
        selectedModelId="openai/gpt-4o"
        onOpenModelPicker={jest.fn()}
        onSelectPrompt={onSelectPrompt}
      />
    );

    expect(getByText("How can I help you today?")).toBeTruthy();
    expect(getByText("Review Workout Progress")).toBeTruthy();
    fireEvent.press(getByText("Review Workout Progress"));
    expect(onSelectPrompt).toHaveBeenCalledWith(
      "How is my strength and volume progressing over my recent workouts?"
    );
  });
});
