
-- Earning dashboard links table
CREATE TABLE public.earning_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  icon_name TEXT DEFAULT 'ExternalLink',
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  embed_type TEXT DEFAULT 'redirect',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.earning_links ENABLE ROW LEVEL SECURITY;

-- Everyone can read active links
CREATE POLICY "Anyone can view active earning links"
  ON public.earning_links FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only admins can manage
CREATE POLICY "Admins can manage earning links"
  ON public.earning_links FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the initial links
INSERT INTO public.earning_links (category, title, description, url, icon_name, position, embed_type) VALUES
  ('Store', 'Naveen Bharat Store', 'Visit our official store on Hoo.be', 'https://hoo.be/naveenbhaarat', 'Store', 1, 'redirect'),
  ('Digital Products', 'Zettelkasten Method', 'Get the Zettelkasten Method digital product on Gumroad', 'https://infoanuj.gumroad.com/l/ZettakastenMethod', 'ShoppingBag', 2, 'redirect'),
  ('Portfolio', 'Certificate Portfolio', 'View certificates and achievements on GitHub', 'https://mranujbabu.github.io/Certificate-Portfolio/', 'Award', 3, 'redirect'),
  ('Blockchain', 'Satoshi Registration Portal', 'Blockchain-based registration system', 'https://satoshi-registration-portal.vercel.app/', 'Shield', 4, 'redirect'),
  ('Blockchain', 'Verify Ledger', 'Verify blockchain ledger entries', 'https://satoshi-registration-portal.vercel.app/verify.html', 'CheckCircle', 5, 'redirect'),
  ('Notion Templates', 'Notion Templates', 'Browse and use our Notion templates (managed by admin)', '', 'FileText', 6, 'embed');
