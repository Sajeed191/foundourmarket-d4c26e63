import type { Role } from "@/lib/command-search";
import {
  runAutomations, retryAllFailed, retryExecution, fetchExecutions,
  fetchAutomationSettings, setAutomationSettings,
} from "@/lib/marketing-automation";

/**
 * Real, executable Command Center actions for the Marketing Automation engine.
 *
 * Unlike QuickAction (navigation only), each AutomationCommand performs a live
 * operation against the database via the audited RPC layer. The Command Center
 * gates them behind a confirmation dialog, role checks, audit logging and a
 * success/error toast. Operations that need an in-context target (failure
 * triage, health inspection) deep-link into the Executions Control Center.
 */

const MANAGER: Role[] = ["admin", "super_admin", "manager"];
const EDITOR: Role[] = ["admin", "super_admin", "manager", "editor"];

export type AutomationCommandResult = {
  message: string;
  /** Optional deep-link to open after the action runs. */
  to?: string;
};

export type AutomationCommand = {
  id: string;
  label: string;
  icon: string;
  keywords: string;
  roles: Role[];
  /** Audit action name written to admin_activity_logs. */
  action: string;
  /** Confirmation copy shown before executing. */
  confirm: string;
  /** Destructive / high-impact styling on the confirm dialog. */
  danger?: boolean;
  /** Executes the operation. Throws on failure. */
  run: () => Promise<AutomationCommandResult>;
  /** Pure navigation operations skip the confirm dialog. */
  navigateOnly?: boolean;
};

async function applySettings(patch: Partial<{ emergency_stop: boolean; global_pause: boolean; maintenance_mode: boolean }>, reason: string) {
  const cur = await fetchAutomationSettings();
  const { settings, error } = await setAutomationSettings(
    {
      emergency_stop: patch.emergency_stop ?? cur.emergency_stop,
      global_pause: patch.global_pause ?? cur.global_pause,
      maintenance_mode: patch.maintenance_mode ?? cur.maintenance_mode,
    },
    reason,
  );
  if (error || !settings) throw new Error(error ?? "Failed to update controls");
  return settings;
}

export const AUTOMATION_COMMANDS: AutomationCommand[] = [
  {
    id: "ac-run-now", label: "Run Automations Now", icon: "Play", keywords: "run automations now execute trigger engine marketing",
    roles: EDITOR, action: "cmd_automation_run_now",
    confirm: "Run all active marketing automations immediately? This evaluates live triggers and may create campaigns and notifications.",
    run: async () => {
      const { summary, error } = await runAutomations();
      if (error) throw new Error(error);
      return { message: `Ran ${summary?.automations_evaluated ?? 0} automations — ${summary?.actions_taken ?? 0} action(s), ${summary?.total_matches ?? 0} matched` };
    },
  },
  {
    id: "ac-retry-failed", label: "Retry Failed Executions", icon: "RotateCcw", keywords: "retry failed executions all automation recover",
    roles: EDITOR, action: "cmd_automation_retry_all",
    confirm: "Retry every retryable failed automation execution now?",
    run: async () => {
      const { count, error } = await retryAllFailed();
      if (error) throw new Error(error);
      return { message: count ? `Retried ${count} failed execution(s)` : "No retryable failures found" };
    },
  },
  {
    id: "ac-retry-latest", label: "Retry Latest Failed Execution", icon: "RotateCcw", keywords: "retry single latest last failed execution recover one",
    roles: EDITOR, action: "cmd_automation_retry_latest",
    confirm: "Retry the most recent failed automation execution?",
    run: async () => {
      const rows = await fetchExecutions(200);
      const latest = rows.find((r) => r.status === "failed" && !r.failed_permanently);
      if (!latest) return { message: "No retryable failed execution found" };
      const { error } = await retryExecution(latest.id);
      if (error) throw new Error(error);
      return { message: "Latest failed execution retried" };
    },
  },
  {
    id: "ac-pause-all", label: "Pause All Automations", icon: "Pause", keywords: "pause all automations stop global hold suspend",
    roles: MANAGER, action: "cmd_automation_pause_all", danger: true,
    confirm: "Pause ALL marketing automations? Triggers will still be evaluated but no actions will execute until resumed.",
    run: async () => {
      await applySettings({ global_pause: true }, "Command Center: pause all");
      return { message: "All automations paused" };
    },
  },
  {
    id: "ac-resume", label: "Resume Automations", icon: "Play", keywords: "resume automations unpause start enable continue",
    roles: MANAGER, action: "cmd_automation_resume",
    confirm: "Resume marketing automations? This clears Global Pause and Emergency Stop.",
    run: async () => {
      await applySettings({ global_pause: false, emergency_stop: false }, "Command Center: resume");
      return { message: "Automations resumed" };
    },
  },
  {
    id: "ac-estop-on", label: "Enable Emergency Stop", icon: "ShieldAlert", keywords: "emergency stop enable kill switch halt freeze",
    roles: MANAGER, action: "cmd_automation_estop_on", danger: true,
    confirm: "ENABLE Emergency Stop? This immediately blocks all automation actions across the platform.",
    run: async () => {
      await applySettings({ emergency_stop: true }, "Command Center: emergency stop on");
      return { message: "Emergency Stop enabled" };
    },
  },
  {
    id: "ac-estop-off", label: "Disable Emergency Stop", icon: "ShieldCheck", keywords: "emergency stop disable clear resume kill switch off",
    roles: MANAGER, action: "cmd_automation_estop_off",
    confirm: "Disable Emergency Stop and allow automations to run again?",
    run: async () => {
      await applySettings({ emergency_stop: false }, "Command Center: emergency stop off");
      return { message: "Emergency Stop disabled" };
    },
  },
  {
    id: "ac-maint-on", label: "Enable Maintenance Mode", icon: "Wrench", keywords: "maintenance mode enable pause actions safe",
    roles: MANAGER, action: "cmd_automation_maint_on", danger: true,
    confirm: "Enable Maintenance Mode? Automations will evaluate but hold actions while you make changes.",
    run: async () => {
      await applySettings({ maintenance_mode: true }, "Command Center: maintenance on");
      return { message: "Maintenance Mode enabled" };
    },
  },
  {
    id: "ac-maint-off", label: "Disable Maintenance Mode", icon: "Wrench", keywords: "maintenance mode disable off resume normal",
    roles: MANAGER, action: "cmd_automation_maint_off",
    confirm: "Disable Maintenance Mode and resume normal automation actions?",
    run: async () => {
      await applySettings({ maintenance_mode: false }, "Command Center: maintenance off");
      return { message: "Maintenance Mode disabled" };
    },
  },
  {
    id: "ac-open-failures", label: "Open Failure Center", icon: "AlertTriangle", keywords: "open failure center failed executions triage errors",
    roles: EDITOR, action: "cmd_automation_open_failures", navigateOnly: true,
    confirm: "",
    run: async () => ({ message: "Opening Failure Center", to: "/admin-marketing-automation?view=failures" }),
  },
  {
    id: "ac-open-health", label: "Open Health Dashboard", icon: "Activity", keywords: "open health dashboard automation status monitor",
    roles: EDITOR, action: "cmd_automation_open_health", navigateOnly: true,
    confirm: "",
    run: async () => ({ message: "Opening Health Dashboard", to: "/admin-marketing-automation?view=health" }),
  },
];

export function automationCommandsForRoles(roles: Set<Role>): AutomationCommand[] {
  return AUTOMATION_COMMANDS.filter((c) => c.roles.some((r) => roles.has(r)));
}
