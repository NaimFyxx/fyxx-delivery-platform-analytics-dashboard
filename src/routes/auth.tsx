import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Fyxx Delivery Tracker" }] }),
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
    toast.success("Account created — signing you in");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative overflow-hidden bg-gradient-surface border-r border-border">
        <div className="absolute inset-0 opacity-30 bg-gradient-primary blur-3xl" />
        <div className="relative z-10 p-12 flex flex-col justify-between w-full">
          <Link to="/" className="font-display text-2xl font-bold tracking-tight">
            Fyxx<span className="text-primary">.</span>
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
          <div className="text-xs text-muted-foreground">© Fyxx Delivery Tracker</div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <div className="lg:hidden mb-6 font-display text-2xl font-bold">
            Fyxx<span className="text-primary">.</span>
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