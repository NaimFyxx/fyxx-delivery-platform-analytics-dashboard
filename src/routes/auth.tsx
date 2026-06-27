import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { UNLOCK_KEY } from "@/hooks/use-soft-gate";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import tgrLogoLight from "@/assets/tgr-logo-light.svg";
import tgrLogoDark from "@/assets/tgr-logo-dark.svg";
import fyxxLogo from "@/assets/fyxx-logo-black.svg";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · The Green Room" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    localStorage.setItem(UNLOCK_KEY, "1");
    toast.success("Welcome back");
    nav({ to: "/dashboard" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    localStorage.setItem(UNLOCK_KEY, "1");
    toast.success("Account created — signing you in");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative overflow-hidden bg-gradient-surface border-r border-border">
        <div className="absolute inset-0 opacity-30 bg-gradient-primary blur-3xl" />
        <div className="relative z-10 p-12 flex flex-col justify-between w-full">
          <Link to="/" className="block">
            <img src={tgrLogoLight} alt="The Green Room" className="h-12 w-auto" />
          </Link>
          <div>
            <h1 className="text-5xl font-bold leading-[1.05]">
              Track every dinar<br />
              <span className="text-primary">on every order.</span>
            </h1>
            <p className="mt-4 text-muted-foreground max-w-md">
              Talabat and Careem performance, side by side. Sales, payouts,
              margin and targets — without the spreadsheet gymnastics.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
            <span>TGR</span>
            <span>×</span>
            <img src={fyxxLogo} alt="Fyxx" className="h-3 w-auto opacity-70" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <div className="lg:hidden mb-6">
            <img src={tgrLogoDark} alt="The Green Room" className="h-10 w-auto" />
          </div>
          <h2 className="text-2xl font-bold mb-1">Welcome</h2>
          <p className="text-sm text-muted-foreground mb-6">Sign in to your dashboard.</p>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4 mt-4">
                <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
                <Field id="password" label="Password" type="password" value={password} onChange={setPassword} />
                <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground shadow-glow" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}Sign in
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4 mt-4">
                <Field id="email2" label="Email" type="email" value={email} onChange={setEmail} />
                <Field id="password2" label="Password" type="password" value={password} onChange={setPassword} />
                <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground shadow-glow" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

function Field(props: { id: string; label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input id={props.id} type={props.type} value={props.value} onChange={(e) => props.onChange(e.target.value)} required autoComplete={props.type === "password" ? "current-password" : "email"} />
    </div>
  );
}