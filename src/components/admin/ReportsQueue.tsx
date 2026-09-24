import { requireRole } from "@/services/auth/queries";
import { listReportsForAdmin } from "@/services/moderation/queries";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ResolveReportActions } from "./ResolveReportActions";

/**
 * The reports queue on /admin/support — open reports first, then recent
 * history. Each card shows who reported what, with the reported content
 * quoted inline so the admin rarely needs to leave the page to judge it.
 */
export async function ReportsQueue() {
  await requireRole("admin");
  const reports = await listReportsForAdmin();

  const open = reports.filter((r) => r.status === "open");
  const handled = reports.filter((r) => r.status !== "open");

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Reports queue
        </h2>
        <div className="flex gap-2">
          <Badge tone={open.length > 0 ? "amber" : "green"}>
            {open.length} open
          </Badge>
          {handled.length > 0 && (
            <Badge tone="neutral">{handled.length} handled</Badge>
          )}
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
          <p className="text-sm text-slate-500">
            No reports yet. When students or tutors flag a message or profile,
            it lands here for review.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {reports.map((report) => {
            const isOpen = report.status === "open";
            return (
              <li key={report.id}>
                <Card className="flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-0 max-w-2xl flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          report.status === "open"
                            ? "amber"
                            : report.status === "resolved"
                              ? "green"
                              : "neutral"
                        }
                      >
                        {report.status}
                      </Badge>
                      <span className="text-sm font-semibold text-slate-900">
                        {report.targetLabel}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-slate-700">
                      {report.reason}
                    </p>

                    {report.targetDetail && (
                      <div className="mt-3 rounded-md border-l-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">
                          Reported {report.targetLabel.toLowerCase()}:
                        </span>{" "}
                        {report.targetDetail}
                      </div>
                    )}

                    <p className="mt-3 text-xs text-slate-400">
                      Reported by{" "}
                      <span className="font-medium text-slate-600">
                        {report.reporterName}
                      </span>
                      {report.reporterCode && (
                        <span className="ml-1.5 font-mono">{report.reporterCode}</span>
                      )}
                    </p>

                    {!isOpen && (
                      <p className="mt-2 text-xs text-slate-400">
                        {report.status}{" "}
                        {report.resolvedAt &&
                          new Date(report.resolvedAt).toLocaleDateString()}
                        {report.resolutionNote && ` — “${report.resolutionNote}”`}
                      </p>
                    )}
                  </div>

                  {isOpen && (
                    <ResolveReportActions reportId={report.id} />
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
