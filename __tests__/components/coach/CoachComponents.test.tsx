import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import { Chat } from "@kesha-antonov/react-native-chat";
import {
  CoachConversation,
  CoachEmptyState,
  CoachErrorCard,
  CoachHeader,
  CoachSidebar,
} from "@/components/coach";
import { toChatErrorState } from "@/lib/ai/errors";
import { confirmAction } from "@/lib/confirm";
import type { CoachMessage, CoachSession } from "@/lib/db/coach";

const mockStartCoachAgent = jest.fn();
const mockAppendCoachMessage = jest.fn();

jest.mock("@/lib/ai/agent", () => ({
  startCoachAgent: (...args: unknown[]) => mockStartCoachAgent(...args),
}));

jest.mock("@/hooks/useCoachSessions", () => ({
  coachQueryKeys: { messages: (id: string) => ["coach", "messages", id] },
  useAppendCoachMessage: () => ({ mutateAsync: mockAppendCoachMessage }),
  useCreateCoachSession: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/lib/confirm", () => ({
  confirmAction: jest.fn(),
}));

const mockPush = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockAppendCoachMessage.mockImplementation(async (input) => ({
    id: "persisted-user",
    ...input,
    tool_calls: null,
    error: null,
    created_at: 2,
  }));
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

  it("renders and handles sidebar collapse button at the sidebar boundary", () => {
    const onToggleSidebar = jest.fn();
    const { getByLabelText } = render(
      <CoachSidebar
        sessions={sampleSessions}
        activeSessionId="session-1"
        onSelectSession={jest.fn()}
        onNewChat={jest.fn()}
        onRenameSession={jest.fn()}
        onDeleteSession={jest.fn()}
        onToggleSidebar={onToggleSidebar}
      />
    );

    const collapseBtn = getByLabelText("Collapse sessions sidebar");
    expect(collapseBtn).toBeTruthy();
    fireEvent.press(collapseBtn);
    expect(onToggleSidebar).toHaveBeenCalled();
  });

  it("regression: sidebar buttons have token-aligned padding divisible by 4", () => {
    const { getByLabelText } = render(
      <CoachSidebar
        sessions={sampleSessions}
        activeSessionId="session-1"
        onSelectSession={jest.fn()}
        onNewChat={jest.fn()}
        onRenameSession={jest.fn()}
        onDeleteSession={jest.fn()}
      />
    );

    const newChatBtn = getByLabelText("Start a new chat");
    const newChatStyle = Array.isArray(newChatBtn.props.style)
      ? Object.assign({}, ...newChatBtn.props.style)
      : newChatBtn.props.style;

    expect(newChatStyle.paddingHorizontal).toBe(16);
    expect(newChatStyle.paddingHorizontal % 4).toBe(0);
    expect(newChatStyle.paddingVertical).toBe(8);
    expect(newChatStyle.paddingVertical % 4).toBe(0);
    expect(newChatStyle.minHeight).toBe(44);
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

  it("renders and toggles the tablet sidebar affordance", () => {
    const onToggleSidebar = jest.fn();
    const { getByLabelText } = render(
      <CoachHeader
        selectedModelId="openai/gpt-4o"
        onOpenModelPicker={jest.fn()}
        sidebarCollapsed={false}
        onToggleSidebar={onToggleSidebar}
      />,
    );

    fireEvent.press(getByLabelText("Collapse sessions sidebar"));
    expect(onToggleSidebar).toHaveBeenCalled();
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

  it("handles step-limit error with retry", () => {
    const onRetry = jest.fn();
    const errorState = toChatErrorState({ kind: "step_limit_reached" });
    const { getByLabelText } = render(<CoachErrorCard error={errorState} onRetry={onRetry} />);

    fireEvent.press(getByLabelText(errorState.recovery.label));
    expect(onRetry).toHaveBeenCalled();
  });

  it("regression: error card and recovery button have non-zero token-aligned padding", () => {
    const errorState = toChatErrorState({ kind: "empty_response" });
    const { getByLabelText } = render(<CoachErrorCard error={errorState} />);

    const alertCard = getByLabelText(`Error: ${errorState.message}`);
    const cardStyle = Array.isArray(alertCard.props.style)
      ? Object.assign({}, ...alertCard.props.style)
      : alertCard.props.style;

    // Card must have positive padding divisible by 4
    expect(cardStyle.padding).toBe(16);
    expect(cardStyle.padding % 4).toBe(0);
    expect(cardStyle.marginHorizontal).toBe(16);
    expect(cardStyle.gap).toBe(12);

    const button = getByLabelText(errorState.recovery.label);
    const buttonStyle = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style)
      : button.props.style;

    expect(buttonStyle.paddingHorizontal).toBe(16);
    expect(buttonStyle.paddingVertical).toBe(8);
    expect(buttonStyle.minHeight).toBe(44);
  });
});

describe("CoachConversation", () => {
  const conversationProps = {
    messages: [],
    activeSessionId: "session-b",
    selectedModelId: "provider/model",
    isMissingKey: false,
    activeError: null,
    onOpenModelPicker: jest.fn(),
    onDismissError: jest.fn(),
    onSessionCreated: jest.fn(),
    onError: jest.fn(),
  };

  it("regression: un-inverts empty state container to prevent mirrored text", () => {
    render(<CoachConversation {...conversationProps} />);

    const chatProps = (Chat as unknown as jest.Mock).mock.calls.at(-1)?.[0];
    expect(chatProps.isInverted).toBe(false);

    // Call renderChatEmpty and verify the returned tree contains counter-transform
    const emptyElement = chatProps.renderChatEmpty();
    const emptyWrapperStyle = Array.isArray(emptyElement.props.style)
      ? Object.assign({}, ...emptyElement.props.style)
      : emptyElement.props.style;

    expect(emptyWrapperStyle.transform).toEqual([{ scaleY: -1 }]);
  });

  it("regression: chronological message ordering in non-inverted list", () => {
    const orderedMessages: CoachMessage[] = [
      { id: "msg-1", session_id: "s-1", role: "user", content: "First", tool_calls: null, error: null, created_at: 1000 },
      { id: "msg-2", session_id: "s-1", role: "assistant", content: "Second", tool_calls: null, error: null, created_at: 2000 },
    ];

    render(<CoachConversation {...conversationProps} messages={orderedMessages} />);

    const chatProps = (Chat as unknown as jest.Mock).mock.calls.at(-1)?.[0];
    expect(chatProps.isInverted).toBe(false);
    expect(chatProps.messages[0]._id).toBe("msg-1");
    expect(chatProps.messages[1]._id).toBe("msg-2");
  });

  it("does not render another session's streaming reply", () => {
    const props = {
      messages: [{ id: "message-1", session_id: "session-b", role: "user", content: "Hello", tool_calls: null, error: null, created_at: 1 }],
      activeSessionId: "session-b",
      selectedModelId: "provider/model",
      isMissingKey: false,
      activeError: null,
      onOpenModelPicker: jest.fn(),
      onDismissError: jest.fn(),
      onSessionCreated: jest.fn(),
      onError: jest.fn(),
    };
    const { queryByText } = render(<CoachConversation {...props} />);

    expect(queryByText("Reply from session A")).toBeNull();
  });

  it("enables the library's streaming-safe markdown renderer for live and persisted replies", () => {
    render(<CoachConversation {...conversationProps} />);

    const chatProps = (Chat as unknown as jest.Mock).mock.calls.at(-1)?.[0];
    expect(chatProps.messageTextProps).toEqual({ markdown: true });
    expect(chatProps.theme.colors).toEqual(expect.objectContaining({
      incomingText: expect.any(String),
      accent: expect.any(String),
      incomingBubble: expect.any(String),
    }));
  });

  it("keeps and grows the streaming bubble across query hydration renders", async () => {
    let emit!: (event: { type: "delta"; text: string }) => void;
    let resolveDone!: (message: { id: string }) => void;
    const done = new Promise<{ id: string }>((resolve) => { resolveDone = resolve; });
    mockStartCoachAgent.mockImplementation((options) => {
      emit = options.onEvent;
      return { done, abort: jest.fn() };
    });

    const view = render(<CoachConversation {...conversationProps} />);
    const input = view.getByPlaceholderText("Ask your AI Coach anything...");
    fireEvent.changeText(input, "Review my training");
    fireEvent.press(view.getByLabelText("Send message"));
    await waitFor(() => expect(mockStartCoachAgent).toHaveBeenCalledTimes(1));

    act(() => emit({ type: "delta", text: "**Reviewing" }));
    expect(view.getByText("**Reviewing")).toBeTruthy();

    view.rerender(<CoachConversation
      {...conversationProps}
      messages={[{
        id: "persisted-user",
        session_id: "session-b",
        role: "user",
        content: "Review my training",
        tool_calls: null,
        error: null,
        created_at: 2,
      }]}
    />);
    act(() => emit({ type: "delta", text: " your workouts**" }));

    expect(view.getByText("**Reviewing your workouts**")).toBeTruthy();
    expect(view.queryByText("**Reviewing")).toBeNull();
    expect(view.getAllByText("Review my training")).toHaveLength(1);
    await act(async () => resolveDone({ id: "assistant-1" }));
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
