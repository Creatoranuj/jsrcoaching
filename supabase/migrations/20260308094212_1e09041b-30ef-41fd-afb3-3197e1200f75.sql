-- Create knowledge_base table for RAG-based memory system
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_base_category_idx ON public.knowledge_base(category);
CREATE INDEX IF NOT EXISTS knowledge_base_keywords_idx ON public.knowledge_base USING GIN(keywords);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active knowledge entries"
  ON public.knowledge_base FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage knowledge base"
  ON public.knowledge_base FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.update_knowledge_base_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER knowledge_base_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_knowledge_base_updated_at();

-- SEED: Comprehensive Platform Manual
INSERT INTO public.knowledge_base (category, title, content, keywords, position) VALUES

('platform_guide', 'Platform Overview – Sadguru Coaching Classes',
'Sadguru Coaching Classes ek online learning platform hai jahan students NEET, JEE, aur Board exams ki preparation kar sakte hain. Platform mein ye features hain:
1. Video Lectures – Pre-recorded video classes dekhne ke liye
2. Live Classes – Real-time online classes teacher ke saath
3. Mock Tests / Quizzes – Practice tests with auto-evaluation
4. Study Materials – PDFs, Notes, DPPs download karne ke liye
5. Timetable – Weekly class schedule dekho
6. Attendance – Apni attendance track karo
7. Notices – Important announcements admin se
8. Messages – Teacher ko directly message kar sakte ho
9. Progress Tracking – Har course mein apni progress dekho
10. Books Library – Recommended books ki list
Admin ya Teacher se related problem ho toh Messages section se contact karein.',
ARRAY['platform', 'features', 'overview', 'website', 'app', 'kya hai', 'what is', 'sadguru'], 1),

('platform_guide', 'Login aur Signup Kaise Karein',
'Naya Account Banana (Signup): Website kholo aur Sign Up button par click karo. Apna poora naam likho. Email address dalo (valid hona chahiye). Strong password banao (minimum 8 characters, ek capital letter, ek number). Create Account par click karo. Email verify karo (inbox aur spam dono check karo).
Login Karna: Email aur password dalo. Login button press karo. Agar password bhool gaye to Forgot Password click karo, email mein link aayega, new password set karo.
Google se login bhi ho sakta hai – Continue with Google button use karo.
Common Issues: Invalid credentials means password galat hai, caps lock check karo. Email nahi aaya toh spam folder check karo, 5 minutes wait karo.',
ARRAY['login', 'signup', 'password', 'forgot password', 'account', 'register', 'email', 'verification'], 2),

('platform_guide', 'Dashboard Kaise Use Karein',
'Dashboard aapka main home page hai after login. Dashboard mein kya milega: Your Progress shows enrolled courses ki progress. Upcoming Schedule shows agle 3 din ki classes. Notifications shows new announcements. Quick Access shows Courses, Tests, Materials ke shortcuts. Batch Info shows aapka current batch.
Navigation on Mobile: Bottom mein menu hai – Home, Courses, Tests, Messages, Profile.
Sidebar on Desktop: Left side mein poora menu milega – Dashboard, Courses, Live Class, Tests, Materials, Timetable, Notices, Books, Messages, Profile, Settings.',
ARRAY['dashboard', 'home', 'navigation', 'menu', 'sidebar', 'bottom nav'], 3),

('platform_guide', 'Video Lecture Kaise Dekhein',
'Step 1: Dashboard mein Courses par click karo. Step 2: Apna enrolled course select karo. Step 3: Chapter select karo. Step 4: Video lecture par click karo.
Video Player Controls: Play/Pause ke liye Spacebar ya player center click karo. 10 sec back ke liye Left arrow key. 10 sec forward ke liye Right arrow key. Volume ke liye Up/Down arrow. Quality change ke liye player ke settings icon se 360p ya 720p select karo. Fullscreen ke liye F key ya right corner button. Playback speed 0.5x se 2x tak settings mein change kar sakte ho.
Important Notes: Video nahi chal raha toh internet connection check karo, page refresh karo, cache clear karo. Video buffering kar raha hai toh lower quality select karo. Mobile mein horizontal landscape mode mein rotate karo best experience ke liye. Progress automatically save hoti hai.',
ARRAY['video', 'lecture', 'player', 'watch', 'controls', 'buffering', 'quality', 'speed', 'nahi chal raha', 'play', 'pause'], 4),

('platform_guide', 'PDF aur Notes Download Kaise Karein',
'PDF Notes download karne ke steps: Course mein jao, Chapter select karo, Lesson open karo. Materials ya Resources tab click karo. PDF file ke saamne download icon dikhega click karo. Ya PDF viewer mein top-right corner mein download button hai.
DPP Daily Practice Problems download: Course mein DPP section mein jao. Date wise ya chapter wise filter karo. Download icon par click karo.
Agar download nahi ho raha: Browser ke popup blocker disable karo. Chrome use karo jo recommended hai. Mobile mein Open in Browser select karo.',
ARRAY['pdf', 'download', 'notes', 'dpp', 'materials', 'resources', 'study material', 'save'], 5),

('platform_guide', 'Mock Test aur Quiz Kaise Dein',
'Test attempt karne ke steps: Sidebar se Tests ya All Tests section mein jao. Available tests ki list dikhegi course aur chapter wise filter karo. Test ke saamne Start Test button click karo. Test instructions padho jisme duration, marks, negative marking hoti hai. Begin Test click karo.
Test attempt karte waqt: Har question mein 4 options dikhenge. Koi option select karo. Next se agle question par jao. Right side mein Question Palette hai – attempted green, unattempted gray, marked for review orange. Mark for Review se question bookmark kar sakte ho. Timer top par dikhega.
Submit ke baad: Immediately result dikhega score percentage pass fail ke saath. Har question ka correct answer aur explanation milega.
Important: Test mein enter karne ke baad refresh mat karo attempt lost ho jayega. Negative marking hoti hai toh unsure questions skip karo.',
ARRAY['test', 'quiz', 'mock test', 'attempt', 'exam', 'question', 'result', 'score', 'marks', 'negative marking', 'submit'], 6),

('platform_guide', 'Live Class Join Kaise Karein',
'Live Class join karne ke steps: Dashboard ya sidebar se Live Class section mein jao. Active live sessions dikhengi, Join button click karo. YouTube live stream browser mein open hogi. Live chat mein questions pooch sakte ho.
Live Class Features: Live Chat mein questions pooch sakte ho teacher se. Raise Hand button se teacher ka attention le sakte ho. Chat mein Q: likhke question type karo teacher answer karega.
Upcoming Live Classes: Upcoming Sessions mein schedule dekho. Date aur time note karo. Phone mein reminder set karo.
Recording: Missed live class toh class ke baad recording usually upload hoti hai course ke video section mein.',
ARRAY['live class', 'live', 'join', 'youtube', 'streaming', 'raise hand', 'chat', 'recording'], 7),

('platform_guide', 'Profile aur Settings Update Karna',
'Profile update karne ke steps: Top-right corner mein apna avatar click karo aur Profile select karo ya sidebar mein Profile option click karo.
Profile mein change kar sakte ho: Profile Photo ke liye Change Avatar click karo image upload karo. Full Name edit kar sakte ho. Mobile Number add ya update kar sakte ho. Email change ke liye contact support se karna padega.
Settings mein: Dark Mode Light Mode toggle kar sakte ho. Notification preferences set kar sakte ho. Password Change ke liye Settings mein Security option hai.
Password Change Steps: Settings mein Security section mein jao. Change Password click karo. Current password aur new password dalo. Save karo.',
ARRAY['profile', 'photo', 'avatar', 'settings', 'dark mode', 'password', 'name', 'mobile', 'update', 'change'], 8),

('platform_guide', 'Teacher ko Message Kaise Karein',
'Teacher ya Admin ko message karne ke steps: Sidebar mein Messages section click karo. New Message ya Compose button click karo. Recipient select karo teacher ya admin. Subject likho. Message likho. Send button press karo.
Kis cheez ke liye message karein: Doubt ya question jo class mein nahi pooch paye. Attendance issue report karna. Payment problem. Technical issue report karna. Course related help.
Response time: Teachers usually working hours mein reply karte hain 9 AM se 9 PM tak. Urgent matters ke liye admin ko message karo.',
ARRAY['message', 'teacher', 'contact', 'help', 'support', 'doubt', 'reply', 'inbox', 'admin'], 9),

('platform_guide', 'Mobile App Install Karna (PWA)',
'Sadguru Coaching Classes ek PWA Progressive Web App hai, matlab alag app download karne ki zaroorat nahi, seedha browser se install ho jaati hai.
Android Chrome mein install karne ke steps: Chrome browser mein website kholo. Address bar ke saamne 3-dot menu click karo. Add to Home Screen ya Install App option select karo. Naam confirm karo Install click karo. Home screen par app icon aa jaayega.
iPhone Safari mein install karne ke steps: Safari mein website kholo, Chrome mein ye option nahi hota iOS par. Bottom mein Share button click karo. Add to Home Screen select karo. Add tap karo.
Benefits: Offline mode mein bhi kuch features kaam karte hain. Full-screen experience milti hai. Notifications milti hain. Fast loading hoti hai.',
ARRAY['app', 'install', 'download', 'mobile', 'android', 'iphone', 'pwa', 'home screen', 'install karna'], 10),

('faqs', 'Video Nahi Chal Raha – Troubleshooting',
'Video nahi chal raha? Step by step fix karo: 1. Internet check karo, speed test karo, minimum 5 Mbps chahiye. 2. Page refresh karo Ctrl+R Windows ya Cmd+R Mac. 3. Browser update karo Chrome latest version use karo. 4. Cache clear karo: Chrome mein Settings Privacy Clear Browsing Data Cache Clear karo. Mobile mein Phone Settings Apps Chrome Clear Cache. 5. Different browser try karo Firefox ya Edge. 6. Incognito mode mein try karo. 7. Video quality kam karo Player settings mein 360p select karo. 8. Ad blocker disable karo extension temporarily off karo.
Mobile specific: App aur browser dono mein try karo. Phone restart karo. WiFi se mobile data switch karo.
Agar phir bhi nahi chala toh Admin ko screenshot bhejo aur URL share karo.',
ARRAY['video', 'nahi chal raha', 'problem', 'error', 'buffering', 'loading', 'stuck', 'play', 'not working', 'fix'], 11),

('faqs', 'PDF Download Nahi Ho Raha – Fix',
'PDF download nahi ho raha? Solutions: 1. Popup blocker check karo: Chrome address bar mein right side mein popup blocked icon dikhta hai, click karo Always allow popups from this site select karo, page refresh karo. 2. Storage check karo phone ya computer mein space honi chahiye. 3. Different browser use karo Chrome recommended hai. 4. Direct download try karo: PDF viewer mein top-right corner mein download icon click karo ya right click Save As. 5. Mobile mein Open in browser option select karo.
Agar PDF hi nahi dikh raha: Course mein enrolled hona chahiye. Admin se confirm karo ki PDF upload hai.',
ARRAY['pdf', 'download', 'nahi ho raha', 'problem', 'popup', 'blocked', 'save', 'fix'], 12),

('faqs', 'Payment Kiya Lekin Course Access Nahi Mila',
'Payment complete lekin course nahi khula? Steps: 1. 5-10 minutes wait karo system update hone mein thoda time lagta hai. 2. Page refresh karo Dashboard reload karo. 3. Logout karke login karo session refresh hoga. 4. Payment confirm karo bank SMS ya email check karo screenshot lo payment ka. 5. Admin ko contact karo Messages section mein Subject Payment Done Course Access Pending likhke payment screenshot attach karo transaction ID dalo course ka naam likho email aur phone number bhi dalo.
Response time: 2-4 working hours mein resolve ho jaata hai usually.',
ARRAY['payment', 'access', 'course nahi khula', 'paid', 'not showing', 'enrolled', 'transaction', 'razorpay'], 13),

('faqs', 'Password Bhool Gaye Reset Kaise Karein',
'Password reset karne ke steps: 1. Login page par Forgot Password link click karo. 2. Registered email address dalo. 3. Send Reset Link click karo. 4. Email inbox check karo spam folder bhi dekho. 5. Email mein Reset Password link click karo jo 15 minutes mein expire hota hai. 6. New password set karo 8 plus characters 1 capital 1 number. 7. Confirm karo aur save karo. 8. New password se login karo.
Email nahi aaya: 5 minutes wait karo. Spam aur Promotions folder check karo. Sahi email address use kiya woh email try karo jisse register kiya tha. Abhi bhi nahi aaya toh Admin ko message karo.',
ARRAY['password', 'forgot', 'reset', 'login', 'bhool gaya', 'email nahi aaya', 'change password'], 14),

('policies', 'Refund Policy',
'Refund Rules: Full Refund 100 percent milti hai agar course purchase ke 7 days ke andar refund request karo aur 20 percent se zyada course content access na kiya ho. Partial Refund 50 percent milti hai 7 se 15 days ke beech request karne par admin discretion par. No Refund hota hai 15 days ke baad ya agar course content significantly access kiya ho.
Refund Request Process: Messages section mein admin ko message karo. Subject mein Refund Request aur Course Name likho. Reason explain karo. Transaction ID aur payment screenshot bhejo. 3-5 working days mein process ho jaata hai. Amount original payment method mein wapis aata hai.',
ARRAY['refund', 'money back', 'cancel', 'return', 'policy', 'paisa wapas', '7 days'], 15),

('policies', 'Course Access Duration aur Expiry',
'Course access duration: Standard Courses mein 12 months 1 year milte hain purchase date se. NEET JEE Full Year mein exam date tak ya 15 months milte hain. Short Courses mein 6 months milte hain.
Access Extend Karna: Expiry se pehle admin se contact karo. Extension fee lagti hai 50 percent of original price. 3 months extension available hai.
Agar access expire ho gaya toh course tab bhi My Courses mein dikhega lekin videos access nahi honge. Admin se extension ke liye contact karo.',
ARRAY['access', 'expiry', 'expire', 'duration', 'time limit', 'validity', '12 months', 'extend', 'how long'], 16),

('policies', 'Code of Conduct – Platform Rules',
'Platform use karte waqt ye rules follow karo: 1. Live chat mein respectful language use karo teacher aur classmates ke saath. 2. Course content share mat karo, videos ya PDFs download karke kisi aur ko dena piracy hai. 3. Multiple accounts banana allowed nahi hai. 4. Abusive language ya harassment kisi bhi case mein allowed nahi hai account suspend ho sakta hai. 5. Test answers share mat karo cheating manno jayega. 6. Teacher ka time respect karo messages mein relevant questions hi poochho.
Violation hone par: First time warning milegi. Second time temporary suspension. Third time permanent ban.',
ARRAY['rules', 'conduct', 'policy', 'behavior', 'suspend', 'ban', 'cheat', 'share', 'piracy'], 17),

('courses', 'Course Enrollment aur Payment Process',
'Course mein enroll karne ke steps: Dashboard ya sidebar se Courses section mein jao. Available courses mein se choose karo. Course par click karo details dekho syllabus teacher fee. Buy Now ya Enroll button click karo.
Payment Methods: UPI GPay PhonePe Paytm recommended hai. Debit Card ya Credit Card bhi accepted hai. Net Banking bhi kaam karta hai. Razorpay payment gateway use hoti hai jo 100 percent secure hai.
After Payment: Automatically enrolled ho jaoge. Confirmation email milegi. Course immediately accessible ho jaata hai.
Payment kiya lekin access nahi mila: Screenshots le lo payment ka. Messages mein admin ko bhejo. 24 hours mein resolve ho jaata hai.',
ARRAY['enroll', 'payment', 'buy', 'fee', 'upi', 'razorpay', 'access', 'paid', 'free course', 'price'], 18),

('platform_guide', 'Attendance aur Timetable Dekhna',
'Attendance check karne ke steps: Sidebar mein Attendance section mein jao. Monthly calendar view mein dikhega green means present red means absent. Percentage bhi dikhi X percent attendance.
Minimum 75 percent attendance required hoti hai most courses mein. Attendance Admin ya Teacher mark karte hain. Agar koi class miss hui toh teacher ko message karo reason explain karo.
Timetable dekhne ke steps: Sidebar mein Timetable option par click karo. Weekly schedule dikhega Monday se Sunday. Har entry mein Subject Teacher Time Room ya Link hota hai.
Agar timetable nahi dikh raha: Enrolled courses hone chahiye. Admin ne timetable set kiya hoga tabhi dikhega. Refresh karo page ko.',
ARRAY['attendance', 'present', 'absent', 'percentage', '75%', 'timetable', 'schedule', 'time', 'class timing'], 19),

('platform_guide', 'Notifications aur Notices Dekhna',
'Notifications: Top bar mein bell icon par click karo. New notifications ki list dikhegi new lessons announcements etc. Bell icon par number badge dikhega unread count.
Notices Official Announcements: Sidebar mein Notices section mein jao. Admin ya teacher ke important notices yahan dikhte hain jaise fee payment reminders holiday announcements exam schedules new course launches important policy changes. Pinned Notices top par dikhte hain ye most important hote hain zaroor padho.',
ARRAY['notification', 'notice', 'announcement', 'bell', 'alert', 'important', 'exam date', 'holiday'], 20);
