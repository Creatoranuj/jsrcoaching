import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";

const Privacy = () => {
  return (
    <main className="min-h-dvh bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="text-primary hover:underline text-sm">← Back to Home</Link>
        <Card className="p-8 mt-4">
          <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-6">Last updated: May 21, 2026</p>

          <section className="space-y-4 text-sm leading-relaxed">
            <p>
              JSR COACHING Coaching ("we", "us", "our") operates the JSR COACHING mobile and web
              application. This Privacy Policy explains what data we collect, how we use it, and
              the choices you have.
            </p>

            <h2 className="text-xl font-semibold mt-6">1. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account info: name, email, mobile number, profile photo</li>
              <li>Learning data: enrolled courses, progress, quiz attempts, attendance</li>
              <li>Payment info: order id and status (processed by Razorpay; we never store card details)</li>
              <li>Device info: app version, OS, crash logs for stability</li>
            </ul>

            <h2 className="text-xl font-semibold mt-6">2. How We Use Data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Deliver course content, lessons, and live classes</li>
              <li>Track your progress and issue certificates</li>
              <li>Process payments and manage enrollments</li>
              <li>Send transactional emails (receipts, password reset, important notices)</li>
              <li>Improve app stability and detect abuse</li>
            </ul>

            <h2 className="text-xl font-semibold mt-6">3. Sharing</h2>
            <p>
              We do not sell your data. We share with: Supabase (database/auth), Razorpay
              (payments), Bunny CDN (video delivery), and email providers — all bound by contract
              to process data only for our service.
            </p>

            <h2 className="text-xl font-semibold mt-6">4. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. On deletion, we
              remove personal data within 30 days; anonymized analytics may persist.
            </p>

            <h2 className="text-xl font-semibold mt-6">5. Your Rights</h2>
            <p>
              You can access, correct, export or delete your data at any time. In-app deletion is
              available in Settings → Delete Account. You can also request deletion as a logged-out
              user at{" "}
              <Link to="/delete-account" className="text-primary hover:underline">
                /delete-account
              </Link>
              .
            </p>

            <h2 className="text-xl font-semibold mt-6">6. Children</h2>
            <p>
              The app is intended for users aged 13 and above. Users under 18 should use the app
              with parental supervision.
            </p>

            <h2 className="text-xl font-semibold mt-6">7. Contact</h2>
            <p>
              Email: <a href="mailto:jsrcoachinginstitute@gmail.com" className="text-primary hover:underline">jsrcoachinginstitute@gmail.com</a>
            </p>
          </section>
        </Card>
      </div>
    </main>
  );
};

export default Privacy;
