import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "หน้าแรก — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "เข้าสู่ระบบติดตามตัวชี้วัด KPI/QI กลุ่มงานเทคนิคการแพทย์ โรงพยาบาลพุทธชินราช พิษณุโลก ดูแดชบอร์ดและรายงานผลการดำเนินงาน" },
      { property: "og:title", content: "หน้าแรก — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "เข้าสู่ระบบติดตามตัวชี้วัด KPI/QI กลุ่มงานเทคนิคการแพทย์ โรงพยาบาลพุทธชินราช พิษณุโลก ดูแดชบอร์ดและรายงานผลการดำเนินงาน" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/" },
      { name: "twitter:title", content: "หน้าแรก — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "เข้าสู่ระบบติดตามตัวชี้วัด KPI/QI กลุ่มงานเทคนิคการแพทย์ โรงพยาบาลพุทธชินราช พิษณุโลก ดูแดชบอร์ดและรายงานผลการดำเนินงาน" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/" }],
  }),
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
  component: () => null,
});
