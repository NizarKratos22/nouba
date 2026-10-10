import type { Locale } from "@/i18n/config";

/**
 * Templated notifications for the mechanical events (round opened, payout sent).
 * The treasurer agent writes the nuanced ones (reminders, exceptions) itself.
 */

type Vars = Record<string, string | number>;

function fill(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

const T: Record<string, Record<Locale, { title: string; body: string }>> = {
  round_open: {
    en: {
      title: "Round {round} of {circle} is open",
      body: "Your contribution of {amount} {currency} is due by {due}. This round goes to {recipient}. Pay from the circle page whenever you are ready.",
    },
    fr: {
      title: "Le tour {round} de {circle} est ouvert",
      body: "Votre contribution de {amount} {currency} est attendue avant le {due}. Ce tour revient à {recipient}. Vous pouvez payer depuis la page du cercle.",
    },
    ar: {
      title: "الدورة {round} من {circle} مفتوحة",
      body: "مساهمتك بقيمة {amount} {currency} مطلوبة قبل {due}. هذه الدورة من نصيب {recipient}. يمكنك الدفع من صفحة الدائرة.",
    },
  },
  payout_sent: {
    en: {
      title: "Round {round} paid out to {recipient}",
      body: "{amount} {currency} was sent to {recipient} through PayPal. Every member has paid this round. Thank you.",
    },
    fr: {
      title: "Tour {round} versé à {recipient}",
      body: "{amount} {currency} ont été envoyés à {recipient} via PayPal. Tous les membres ont payé ce tour. Merci.",
    },
    ar: {
      title: "تم دفع الدورة {round} إلى {recipient}",
      body: "تم إرسال {amount} {currency} إلى {recipient} عبر PayPal. جميع الأعضاء دفعوا هذه الدورة. شكراً لكم.",
    },
  },
  payout_received: {
    en: {
      title: "It is your turn: {amount} {currency} is on its way",
      body: "Round {round} of {circle} was paid to your PayPal account {paypalEmail}. The pot was {amount} {currency}.",
    },
    fr: {
      title: "C'est votre tour : {amount} {currency} en route",
      body: "Le tour {round} de {circle} a été versé sur votre compte PayPal {paypalEmail}. La cagnotte était de {amount} {currency}.",
    },
    ar: {
      title: "جاءت نوبتك: {amount} {currency} في الطريق",
      body: "تم دفع الدورة {round} من {circle} إلى حساب PayPal الخاص بك {paypalEmail}. قيمة الصندوق {amount} {currency}.",
    },
  },
  circle_complete: {
    en: {
      title: "{circle} is complete",
      body: "All {rounds} rounds were paid out. The full ledger stays available on the circle page.",
    },
    fr: {
      title: "{circle} est terminé",
      body: "Les {rounds} tours ont tous été versés. Le registre complet reste disponible sur la page du cercle.",
    },
    ar: {
      title: "اكتملت {circle}",
      body: "تم دفع جميع الدورات ({rounds}). يبقى السجل الكامل متاحاً في صفحة الدائرة.",
    },
  },
};

export function template(key: keyof typeof T, locale: Locale, vars: Vars) {
  const entry = T[key][locale] ?? T[key].en;
  return { title: fill(entry.title, vars), body: fill(entry.body, vars) };
}

export function formatDate(date: Date, locale: Locale): string {
  const tag = locale === "ar" ? "ar-TN" : locale === "fr" ? "fr-FR" : "en-GB";
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }).format(date);
}
