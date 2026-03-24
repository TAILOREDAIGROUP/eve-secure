import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AssessmentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AssessmentState {
  currentAssessmentId: string | null;
  currentSection: string | null;
  messages: AssessmentMessage[];
  assessmentData: any;
  progress: number;

  // Actions
  setCurrentAssessmentId: (id: string) => void;
  setCurrentSection: (section: string) => void;
  addMessage: (message: AssessmentMessage) => void;
  setAssessmentData: (data: any) => void;
  setProgress: (progress: number) => void;
  reset: () => void;
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set) => ({
      currentAssessmentId: null,
      currentSection: null,
      messages: [],
      assessmentData: null,
      progress: 0,

      setCurrentAssessmentId: (id) =>
        set({ currentAssessmentId: id }),

      setCurrentSection: (section) =>
        set({ currentSection: section }),

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      setAssessmentData: (data) =>
        set({ assessmentData: data }),

      setProgress: (progress) =>
        set({ progress }),

      reset: () =>
        set({
          currentAssessmentId: null,
          currentSection: null,
          messages: [],
          assessmentData: null,
          progress: 0,
        }),
    }),
    {
      name: "assessment-store",
      version: 1,
    }
  )
);
