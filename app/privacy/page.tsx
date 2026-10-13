export const metadata = {
  title: '隐私政策 · 元婴采集器',
};

export default function Privacy() {
  return (
    <div className="p-5 max-w-2xl mx-auto text-stone-300 text-sm leading-relaxed space-y-4">
      <a href="/" className="text-xs text-stone-500">
        ← 返回
      </a>
      <h1 className="text-xl text-stone-100">隐私政策 · 元婴采集器</h1>
      <p className="text-xs text-stone-500">更新日期：2026-10-13</p>

      <p>
        元婴采集器（Android 应用，包名 com.yourorg.yuanying.collector，
        以下简称「本应用」）是元婴的一个可选组件，用于采集你手机上的应用使用情况，
        帮助元婴理解你的作息与注意力。本政策说明我们采集什么、为什么采集、数据存到哪里，
        以及你如何控制。
      </p>

      <h2 className="text-stone-100 text-base pt-2">1. 采集的数据</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>前台应用的使用时长：应用包名、应用显示名称、前台分钟数。</li>
        <li>采集窗口：按小时聚合，仅统计前台使用时间 ≥ 1 分钟的应用。</li>
        <li>不采集：消息内容、照片、位置、通讯录、键盘输入、账号信息。</li>
      </ul>

      <h2 className="text-stone-100 text-base pt-2">2. 用途</h2>
      <p>
        数据仅用于元婴自身的分析，在与你对话时作为上下文参考（例如「今天做了什么」）。
        不用于广告、画像售卖或任何对外分析。
      </p>

      <h2 className="text-stone-100 text-base pt-2">3. 存储与共享</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>数据经 HTTPS 直接写入你自己的 Supabase（PostgreSQL）数据库。</li>
        <li>不经过任何第三方数据服务器，不出售、不共享给第三方。</li>
        <li>本应用不在设备本地长期保存使用数据。</li>
      </ul>

      <h2 className="text-stone-100 text-base pt-2">4. 权限</h2>
      <p>
        本应用需要「使用情况访问」（Usage Access）权限读取系统记录的应用使用时长。
        该权限需你在系统设置中手动授予，可随时撤销。撤销后本应用停止采集。
      </p>

      <h2 className="text-stone-100 text-base pt-2">5. 你的控制与删除</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>可随时在元婴 PWA 的「设置」中关闭活动采集开关。</li>
        <li>可在系统设置中撤销使用情况访问权限。</li>
        <li>数据存储在你的 Supabase 中，可随时查询、导出或删除。</li>
        <li>卸载本应用即可停止所有采集。</li>
      </ul>

      <h2 className="text-stone-100 text-base pt-2">6. 保留期限</h2>
      <p>数据保留期限由你（数据库所有者）决定，我们不做自动过期。</p>

      <h2 className="text-stone-100 text-base pt-2">7. 儿童</h2>
      <p>本应用不面向儿童，不有意采集儿童数据。</p>

      <h2 className="text-stone-100 text-base pt-2">8. 联系方式</h2>
      <p>
        如对隐私有疑问，请通过本应用的代码仓库
        https://github.com/gmyky57ndd-dev/yuanying 提交 issue 联系开发者。
      </p>

      <hr className="border-stone-800 my-6" />

      <h1 className="text-lg text-stone-100">Privacy Policy (English)</h1>
      <p>
        Yuanying Collector (package com.yourorg.yuanying.collector) is an optional
        component of Yuanying that collects app usage on your phone to help
        Yuanying understand your rhythm and focus.
      </p>
      <p>
        <strong>What we collect:</strong> foreground app usage — package name,
        app label, and foreground minutes (aggregated hourly; apps under 1
        minute are ignored). We do <strong>not</strong> collect messages,
        photos, location, contacts, keystrokes, or account info.
      </p>
      <p>
        <strong>Purpose:</strong> used only by Yuanying as conversational
        context. No ads, no profiling, no third‑party analytics.
      </p>
      <p>
        <strong>Storage &amp; sharing:</strong> data is sent over HTTPS directly
        to your own Supabase (PostgreSQL) database. It is not routed through any
        third‑party server and is never sold or shared. Minimal data is kept on
        device.
      </p>
      <p>
        <strong>Permission:</strong> Usage Access, granted manually in system
        settings, revocable at any time.
      </p>
      <p>
        <strong>Control &amp; deletion:</strong> disable collection in the
        Yuanying PWA settings, revoke the permission, or query/export/delete the
        data in your Supabase.
      </p>
      <p>
        <strong>Contact:</strong>{' '}
        https://github.com/gmyky57ndd-dev/yuanying
      </p>
    </div>
  );
}
