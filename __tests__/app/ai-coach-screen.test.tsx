import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import AiCoachScreen from "@/app/(tabs)/ai-coach";
import { renderScreen } from "../helpers/render";
import { useLayout } from "@/lib/layout";
import {
  useCoachSessions,
  useCoachMessages,
  useCreateCoachSession,
  useRenameCoachSession,
  useDeleteCoachSession,
  useAppendCoachMessage,
} from "@/hooks/useCoachSessions";
import { useKeyStatus } from "@/hooks/useKeyStatus";
import { useModelCatalog, useRefreshModelCatalog } from "@/hooks/useModelCatalog";
import { startCoachAgent, type CoachAgentOptions } from "@/lib/ai/agent";

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/lib/layout", () => ({
  useLayout: jest.fn(),
}));

jest.mock("@/hooks/useCoachSessions", () => ({
  coachQueryKeys: {
    sessions: ["coach", "sessions"],
    messages: (id: string) => ["coach", "messages", id],
  },
  useCoachSessions: jest.fn(),
  useCoachMessages: jest.fn(),
  useCreateCoachSession: jest.fn(),
  useRenameCoachSession: jest.fn(),
  useDeleteCoachSession: jest.fn(),
  useAppendCoachMessage: jest.fn(),
}));

jest.mock("@/hooks/useKeyStatus", () => ({
  useKeyStatus: jest.fn(),
}));

jest.mock("@/hooks/useModelCatalog", () => ({
  useModelCatalog: jest.fn(),
  useRefreshModelCatalog: jest.fn(),
}));

jest.mock("@/lib/ai/agent", () => ({
  startCoachAgent: jest.fn(),
}));

describe("AiCoachScreen Integration", () => {
  const mockSetOptions = jest.fn();
  const mockPush = jest.fn();
  const mockCreateSession = jest.fn();
  const mockAppendMessage = jest.fn();
  const mockDeleteSession = jest.fn();
  const mockRenameSession = jest.fn();
  const mockRefreshCatalog = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: mockSetOptions,
    });

    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });

    (useLayout as jest.Mock).mockReturnValue({
      compact: true,
      medium: false,
      expanded: false,
      atLeastMedium: false,
      width: 375,
      scale: 1.0,
      horizontalPadding: 16,
    });

    (useCoachSessions as jest.Mock).mockReturnValue({
      data: [
        {
          id: "session-1",
          title: "Upper Body Hypertrophy",
          model_id: "openai/gpt-4o",
          created_at: 1700000000000,
          updated_at: 1700000000000,
        },
      ],
      isLoading: false,
    });

    (useCoachMessages as jest.Mock).mockReturnValue({
      data: [
        {
          id: "msg-1",
          session_id: "session-1",
          role: "user",
          content: "What is my current bench 1RM?",
          created_at: 1700000001000,
          tool_calls: null,
          error: null,
        },
        {
          id: "msg-2",
          session_id: "session-1",
          role: "assistant",
          content: "Your estimated bench 1RM is 100kg.",
          created_at: 1700000005000,
          tool_calls: '[{"name":"exercise_history"}]',
          error: null,
        },
      ],
      isLoading: false,
    });

    (useCreateCoachSession as jest.Mock).mockReturnValue({
      mutateAsync: mockCreateSession.mockResolvedValue({
        id: "session-new",
        title: "New Chat",
        model_id: "openai/gpt-4o",
      }),
    });

    (useAppendCoachMessage as jest.Mock).mockReturnValue({
      mutateAsync: mockAppendMessage.mockResolvedValue({
        id: "msg-user-new",
        role: "user",
        content: "Hello",
      }),
    });

    (useDeleteCoachSession as jest.Mock).mockReturnValue({
      mutateAsync: mockDeleteSession.mockResolvedValue(undefined),
    });

    (useRenameCoachSession as jest.Mock).mockReturnValue({
      mutateAsync: mockRenameSession.mockResolvedValue(undefined),
    });

    (useKeyStatus as jest.Mock).mockReturnValue({
      data: { kind: "ready", limit_remaining: 100 },
      isLoading: false,
    });

    (useModelCatalog as jest.Mock).mockReturnValue({
      data: {
        models: [
          {
            id: "openai/gpt-4o",
            name: "GPT-4o",
            contextLength: 128000,
            pricing: { prompt: "0.000005", completion: "0.000015" },
            supportedParameters: ["tools"],
          },
        ],
        stale: false,
        cachedAt: Date.now(),
        warning: null,
      },
      isLoading: false,
    });

    (useRefreshModelCatalog as jest.Mock).mockReturnValue(mockRefreshCatalog);
  });

  it("registers headerLeft toggle icon on phone (compact) layout", () => {
    renderScreen(<AiCoachScreen />);

    expect(mockSetOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        headerLeft: expect.any(Function),
      })
    );
  });

  it("hides headerLeft toggle on tablet (atLeastMedium) layout and shows persistent sidebar", () => {
    (useLayout as jest.Mock).mockReturnValue({
      compact: false,
      medium: true,
      expanded: false,
      atLeastMedium: true,
      width: 768,
      scale: 1.1,
      horizontalPadding: 24,
    });

    const { getByText } = renderScreen(<AiCoachScreen />);

    expect(mockSetOptions).toHaveBeenCalledWith({
      headerLeft: expect.any(Function),
    });
    // On tablet, conversations sidebar is visible directly in the screen tree
    expect(getByText("Conversations")).toBeTruthy();
    expect(getByText("Upper Body Hypertrophy")).toBeTruthy();
  });

  it("renders conversation messages correctly", () => {
    const { getByText } = renderScreen(<AiCoachScreen />);

    expect(getByText("What is my current bench 1RM?")).toBeTruthy();
    expect(getByText("Your estimated bench 1RM is 100kg.")).toBeTruthy();
    expect(getByText("Data consulted: local records")).toBeTruthy();
  });

  it("handles sending a message and starting the agent run", async () => {
    const mockAbort = jest.fn();
    (startCoachAgent as jest.Mock).mockImplementation(() => {
      return {
        done: Promise.resolve({
          id: "msg-assistant-persisted",
          role: "assistant",
          content: "Here is your answer",
        }),
        abort: mockAbort,
      };
    });

    const { getByPlaceholderText, getByLabelText } = renderScreen(<AiCoachScreen />);

    const input = getByPlaceholderText("Ask your AI Coach anything...");
    fireEvent.changeText(input, "How should I deload next week?");

    const sendBtn = getByLabelText("Send message");
    fireEvent.press(sendBtn);

    await waitFor(() => {
      expect(mockAppendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: "session-1",
          role: "user",
          content: "How should I deload next week?",
        })
      );
      expect(startCoachAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          modelId: "openai/gpt-4o",
          prompt: "How should I deload next week?",
        })
      );
    });
  });

  it("handles streaming stop button", async () => {
    const mockAbort = jest.fn();
    let resolveDone!: (value: unknown) => void;
    const donePromise = new Promise<unknown>((resolve) => {
      resolveDone = resolve;
    });

    (startCoachAgent as jest.Mock).mockImplementation(() => ({
      done: donePromise,
      abort: mockAbort,
    }));

    const { getByPlaceholderText, getByLabelText, findByLabelText } = renderScreen(
      <AiCoachScreen />
    );

    const input = getByPlaceholderText("Ask your AI Coach anything...");
    fireEvent.changeText(input, "Generate a 12-week program");

    const sendBtn = getByLabelText("Send message");
    fireEvent.press(sendBtn);

    const stopBtn = await findByLabelText("Stop generating");
    expect(stopBtn).toBeTruthy();

    fireEvent.press(stopBtn);
    expect(mockAbort).toHaveBeenCalled();

    resolveDone({ id: "msg-stop", role: "assistant", content: "Partial" });
    await waitFor(() => expect(mockAppendMessage).toHaveBeenCalledTimes(1));
  });

  it("aborts before agent creation when switching sessions during message persistence", async () => {
    let releaseAppend!: () => void;
    const appendPending = new Promise<void>((resolve) => { releaseAppend = resolve; });
    mockAppendMessage.mockImplementationOnce(() => appendPending as never);
    (useCoachSessions as jest.Mock).mockReturnValue({
      data: [
        { id: "session-1", title: "Upper Body Hypertrophy", model_id: "openai/gpt-4o", created_at: 1, updated_at: 1 },
        { id: "session-2", title: "Nutrition Advice", model_id: "openai/gpt-4o", created_at: 2, updated_at: 2 },
      ],
      isLoading: false,
    });
    (useLayout as jest.Mock).mockReturnValue({
      compact: false,
      medium: true,
      expanded: false,
      atLeastMedium: true,
      width: 768,
      scale: 1,
      horizontalPadding: 24,
    });

    const { getByPlaceholderText, getByLabelText, getByText } = renderScreen(<AiCoachScreen />);
    fireEvent.changeText(getByPlaceholderText("Ask your AI Coach anything..."), "Check my progress");
    fireEvent.press(getByLabelText("Send message"));
    await waitFor(() => expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "user" })));

    fireEvent.press(getByText("Nutrition Advice"));
    releaseAppend();

    await waitFor(() => expect(startCoachAgent).not.toHaveBeenCalled());
    expect(mockAppendMessage).toHaveBeenCalledTimes(1);
  });

  it("handles no-key error state and links to /settings/ai-key", async () => {
    (useKeyStatus as jest.Mock).mockReturnValue({
      data: { kind: "missing_key" },
      isLoading: false,
    });

    (useCoachMessages as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });

    const { getByText } = renderScreen(<AiCoachScreen />);

    expect(getByText("API Key Required")).toBeTruthy();
    fireEvent.press(getByText("Add Key"));
    expect(mockPush).toHaveBeenCalledWith("/settings/ai-key");
  });

  it("handles no model selected state without pre-filling or persisting a model", () => {
    (useCoachSessions as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });
    (useCoachMessages as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });

    const { getByText, getByPlaceholderText, queryByText } = renderScreen(<AiCoachScreen />);

    expect(getByText("Select an AI Model")).toBeTruthy();
    expect(
      getByText("Choose a model from the OpenRouter catalog to power your AI Coach conversations.")
    ).toBeTruthy();
    expect(getByPlaceholderText("Select a model above to begin...")).toBeTruthy();
    expect(queryByText("openai/gpt-4o")).toBeNull();

    const selectModelBtn = getByText("Select Model");
    fireEvent.press(selectModelBtn);
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(startCoachAgent).not.toHaveBeenCalled();
  });

  it("renders suggestions when empty sessions has a selected model", () => {
    (useCoachSessions as jest.Mock).mockReturnValue({
      data: [
        {
          id: "session-empty",
          title: "New Session",
          model_id: "openai/gpt-4o",
          created_at: 1700000000000,
          updated_at: 1700000000000,
        },
      ],
      isLoading: false,
    });
    (useCoachMessages as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });

    const { getByText } = renderScreen(<AiCoachScreen />);

    expect(getByText("How can I help you today?")).toBeTruthy();
    expect(getByText("Review Workout Progress")).toBeTruthy();
    expect(getByText("Nutrition & Macros")).toBeTruthy();
    expect(getByText("Exercise Technique")).toBeTruthy();
  });

  it("renders tool in flight state during agent run", async () => {
    let capturedOnEvent: CoachAgentOptions["onEvent"];
    let resolveDone!: (value: unknown) => void;
    const donePromise = new Promise<unknown>((resolve) => {
      resolveDone = resolve;
    });

    (startCoachAgent as jest.Mock).mockImplementation((options) => {
      capturedOnEvent = options.onEvent;
      return {
        done: donePromise,
        abort: jest.fn(),
      };
    });

    const { getByPlaceholderText, getByLabelText, findByText, getByText, queryByText } = renderScreen(
      <AiCoachScreen />
    );

    const input = getByPlaceholderText("Ask your AI Coach anything...");
    fireEvent.changeText(input, "Check my bench history");

    const sendBtn = getByLabelText("Send message");
    fireEvent.press(sendBtn);

    await waitFor(() => {
      expect(capturedOnEvent).not.toBeNull();
    });

    capturedOnEvent!({ type: "delta", text: "Bench progress is " });
    await waitFor(() => expect(getByText("Bench progress is ")).toBeTruthy());
    capturedOnEvent!({ type: "delta", text: "improving." });
    await waitFor(() => expect(getByText("Bench progress is improving.")).toBeTruthy());

    // Trigger tool-call event
    capturedOnEvent!({
      type: "tool-call",
      name: "exercise_history",
      input: { exerciseName: "Bench Press" },
    });

    const toolBadge = await findByText("Analyzing exercise progress...");
    expect(toolBadge).toBeTruthy();

    capturedOnEvent!({
      type: "tool-result",
      name: "exercise_history",
      output: { entries: [] },
    });
    await waitFor(() => expect(queryByText("Analyzing exercise progress...")).toBeNull());

    resolveDone({ id: "msg-done", role: "assistant", content: "Bench progress looks solid" });
  });

  it("renders distinct error states for network and rate-limit errors", async () => {
    (startCoachAgent as jest.Mock).mockReturnValue({
      done: Promise.reject({
        kind: "rate_limited",
        status: 429,
        limitSource: "tier_free",
      }),
      abort: jest.fn(),
    });

    const { getByPlaceholderText, getByLabelText, findByText, getByText } = renderScreen(
      <AiCoachScreen />
    );

    const input = getByPlaceholderText("Ask your AI Coach anything...");
    fireEvent.changeText(input, "Tell me a workout plan");

    const sendBtn = getByLabelText("Send message");
    fireEvent.press(sendBtn);

    const errorMsg = await findByText(/tier_free: OpenRouter rate limit reached/);
    expect(errorMsg).toBeTruthy();
    expect(getByText("Retry later")).toBeTruthy();
    expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
      session_id: "session-1",
      role: "assistant",
      error: JSON.stringify({ kind: "rate_limited", status: 429, limitSource: "tier_free" }),
    }));
    expect(mockAppendMessage).toHaveBeenCalledTimes(2);
  });

  it("renders stale catalog badge and triggers refresh on press", () => {
    (useModelCatalog as jest.Mock).mockReturnValue({
      data: {
        models: [
          {
            id: "openai/gpt-4o",
            name: "GPT-4o",
            contextLength: 128000,
            pricing: { prompt: "0.000005", completion: "0.000015" },
            supportedParameters: ["tools"],
          },
        ],
        stale: true,
        cachedAt: Date.now() - 3600000,
        warning: { kind: "stale_catalog_warning" },
      },
      isLoading: false,
    });

    const { getByLabelText, getByText } = renderScreen(<AiCoachScreen />);

    expect(getByText("Cached catalog")).toBeTruthy();
    const refreshBtn = getByLabelText("Catalog is cached. Tap to refresh.");
    fireEvent.press(refreshBtn);
    expect(mockRefreshCatalog).toHaveBeenCalled();
  });

  it("handles New Chat without auto-picking or defaulting to unselected models", async () => {
    (useLayout as jest.Mock).mockReturnValue({
      compact: false,
      medium: true,
      expanded: false,
      atLeastMedium: true,
      width: 768,
      scale: 1.1,
      horizontalPadding: 24,
    });

    const { getByLabelText, queryByText } = renderScreen(<AiCoachScreen />);

    // Click "New Chat" in tablet sidebar
    const newChatBtn = getByLabelText("Start a new chat");
    fireEvent.press(newChatBtn);

    // In New Chat mode, activeSessionId is null
    expect(queryByText("Upper Body Hypertrophy")).toBeTruthy(); // in sidebar
  });
});
