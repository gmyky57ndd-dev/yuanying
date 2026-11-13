import Link from 'next/link';
import { supabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TOOLS = [
  ['git_commit', 'GitHub Contents API 创建 branch/commit；不碰本地 .git', 'approval_id + issue'],
  ['submit_pr', 'GitHub REST 创建 PR；禁止 merge/force', 'approval_id + CI'],
  ['run_terminal_command', 'workspace 内 argv 白名单；无 shell、无 rm/sudo', '每次审批'],
  ['run_test_suite', '只允许 npm test / test:e2e 包装', 'approval_id'],
  ['write_code_file', 'workspace 内代码文件 + diff', 'diff 预览'],
  ['deploy_to_coolify', 'Coolify webhook；只在 UI 触发', 'Owner 红色弹窗'],
  ['update_env_vars', '加密 + diff；日志脱敏', 'Owner 弹窗'],
  ['read_server_logs', '只读 tail + 脱敏', '只读'],
];

export default async function SandboxPage() {
  const { data: approval } = await supabase
    .from('work_approvals')
    .select('id, status, title')
    .eq('title', 'v0.02 沙箱安全设计确认')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="min-h-[100dvh] bg-[#f7f4ee] px-6 py-8 text-stone-800">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/desktop" className="text-sm text-stone-500 hover:underline">
            ← 返回 Hub
          </Link>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] text-amber-800">
            设计稿 · 未写实现代码
          </span>
        </div>

        <h1 className="text-2xl font-semibold">v0.02 沙箱安全设计</h1>
        <p className="mt-2 text-sm text-stone-500">
          8 个高危工具的权限边界。Owner 批准后按阶段实现；当前只展示设计。
        </p>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          {approval ? (
            <>
              审批 <strong>#{approval.id}</strong> · <strong>{approval.status}</strong>
              {' · '}
              <Link href="/desktop/workpad/yuanying" className="underline">
                去 Workpad 审批 tab 批准
              </Link>
            </>
          ) : (
            <Link href="/desktop/workpad/yuanying" className="underline">
              在 Workpad 审批 tab 查看设计审批
            </Link>
          )}
        </div>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-600">8 个工具的处理方式</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-stone-400">
                <tr>
                  <th className="py-1 pr-3">工具</th>
                  <th className="py-1 pr-3">允许</th>
                  <th className="py-1">确认</th>
                </tr>
              </thead>
              <tbody>
                {TOOLS.map(([name, allow, confirm]) => (
                  <tr key={name} className="border-t border-stone-100">
                    <td className="py-2 pr-3 font-mono text-[11px]">{name}</td>
                    <td className="py-2 pr-3">{allow}</td>
                    <td className="py-2 text-stone-500">{confirm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-600">Git 写操作</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-stone-600">
              <li>只走 GitHub REST API，绝不读写 Mac 本地 .git。</li>
              <li>branch 从 main SHA 创建；PR 由 Owner 手动合并。</li>
              <li>禁止路径：.git/**、.env*、*secret*、node_modules/**。</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-600">代码执行</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-stone-600">
              <li>固定 workspace：~/yuanying/workspace/&lt;project&gt;。</li>
              <li>argv 白名单 + 无 shell；禁止 rm/sudo/curl/ssh。</li>
              <li>120s 超时、200KB 输出上限、独立 runner。</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <h2 className="text-sm font-semibold text-rose-700">生产发布</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-rose-800">
              <li>模型不能直接调用 deploy_to_coolify。</li>
              <li>红色全屏确认弹窗 + 输入确认短语。</li>
              <li>一次性 token 调用 Coolify webhook；全量审计。</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-600">审计与门槛</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-stone-600">
              <li>每次调用记录 approval_id、参数摘要、结果。</li>
              <li>拒绝原因：whitelist_denied / path_denied / command_denied。</li>
              <li>分阶段：日志 → GitHub API → runner → 部署弹窗。</li>
            </ul>
          </div>
        </section>

        <p className="mt-6 text-[11px] text-stone-400">
          完整文档：<code>docs/specs/SANDBOX-SECURITY-v0.02.md</code>。批准前不会新增任何高危工具。
        </p>
      </div>
    </div>
  );
}
