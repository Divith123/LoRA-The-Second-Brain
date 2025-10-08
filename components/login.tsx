"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShineBorder } from "@/components/ui/shine-border";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, User, Lock, Users, Check, X, HelpCircle, Mail } from "lucide-react";
import { useUser } from "./user-context";
import { ForgotPasswordModal } from "./forgot-password-modal";

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const { users, login, createUser } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "create">("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Auto-switch to create mode if no users exist (only on initial load)
  useEffect(() => {
    if (users.length === 0 && mode === "login") {
      setMode("create");
    }
  }, [users.length]); // Remove mode from dependencies to prevent overriding user choice

  // Password strength validation
  const validatePasswordStrength = (password: string) => {
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const hasNoCommonWords = !/(password|123456|qwerty|admin|user|login)/i.test(password);

    return {
      isValid: password.length >= minLength &&
               hasUpperCase &&
               hasLowerCase &&
               hasNumbers &&
               hasSpecialChars &&
               hasNoCommonWords,
      checks: {
        length: password.length >= minLength,
        uppercase: hasUpperCase,
        lowercase: hasLowerCase,
        numbers: hasNumbers,
        special: hasSpecialChars,
        noCommon: hasNoCommonWords
      }
    };
  };

  const passwordValidation = validatePasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      if (mode === "create") {
        // Validate password strength for new accounts
        if (!passwordValidation.isValid) {
          setError("Password does not meet security requirements. Please ensure it meets all criteria below.");
          setIsLoading(false);
          return;
        }

        const userName = name.trim() || email.split('@')[0];
        const success = await createUser(userName, email.trim(), password.trim(), securityQuestion.trim(), securityAnswer.trim());
        if (success) {
          const loginSuccess = await login(email.trim(), password.trim());
          if (loginSuccess) {
            onLogin();
          } else {
            setError("Failed to login after account creation");
          }
        } else {
          setError("User already exists. Please login instead.");
          setMode("login");
        }
      } else {
        // Allow login attempts even if no users exist, but show helpful error
        const success = await login(email.trim(), password.trim());
        if (success) {
          onLogin();
        } else {
          if (users.length === 0) {
            setError("No accounts found. Please create an account first.");
            setMode("create");
          } else {
            setError("Invalid username or password");
          }
        }
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    }

    setIsLoading(false);
  };

  const switchMode = () => {
    setMode(mode === "login" ? "create" : "login");
    setError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="relative w-full max-w-md">
        <ShineBorder
          borderWidth={2}
          duration={8}
          shineColor={["#3b82f6", "#8b5cf6", "#06b6d4"]}
          className="rounded-2xl"
        />
        <Card className="relative bg-card/95 backdrop-blur-sm border-0 shadow-2xl">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {mode === "create" ? "Create Account" : users.length > 0 ? "Welcome Back" : "Welcome to LoRA"}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {mode === "create"
                ? users.length > 0
                  ? "Create a new account to get started"
                  : "Create your first account to get started"
                : users.length > 0
                  ? "Enter your credentials to continue"
                  : "No accounts found. Please create an account first."
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {mode === "create" && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    Full Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10 h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  {mode === "create" ? "Email" : "Email"}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={mode === "create" ? "Enter your email" : "Enter your email"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {mode === "create" && password && (
                  <div className="space-y-2 mt-2">
                    <div className="text-xs text-muted-foreground">Password requirements:</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.length ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.length ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        12+ characters
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.uppercase ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.uppercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        Uppercase letter
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.lowercase ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.lowercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        Lowercase letter
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.numbers ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.numbers ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        Number
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.special ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.special ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        Special character
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.noCommon ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.noCommon ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        No common words
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {mode === "create" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="securityQuestion" className="text-sm font-medium">
                      Security Question
                    </Label>
                    <Input
                      id="securityQuestion"
                      type="text"
                      placeholder="e.g., What was the name of your first pet?"
                      value={securityQuestion}
                      onChange={(e) => setSecurityQuestion(e.target.value)}
                      className="h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="securityAnswer" className="text-sm font-medium">
                      Security Answer
                    </Label>
                    <Input
                      id="securityAnswer"
                      type="text"
                      placeholder="Your answer (case insensitive)"
                      value={securityAnswer}
                      onChange={(e) => setSecurityAnswer(e.target.value)}
                      className="h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors"
                      required
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded-md">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-200 shadow-lg hover:shadow-xl"
                disabled={isLoading || !name.trim() || !password.trim() || (mode === "create" && (!securityQuestion.trim() || !securityAnswer.trim()))}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {mode === "create" ? "Creating account..." : "Signing in..."}
                  </div>
                ) : (
                  mode === "create" ? "Create Account" : "Continue to LoRA"
                )}
              </Button>
            </form>

            {mode === "login" && users.length > 0 && (
              <div className="mt-4 text-center">
                <Button
                  variant="link"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Forgot your password?
                </Button>
              </div>
            )}

            <div className="mt-4 text-center">
              <Button
                variant="link"
                onClick={switchMode}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                {mode === "login"
                  ? "Don't have an account? Create one"
                  : "Already have an account? Sign in"
                }
              </Button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-muted-foreground">
                Your data stays local and secure • Offline AI
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onSuccess={() => {
          setShowForgotPassword(false);
          setError("");
          // Optionally switch to login mode
          setMode("login");
        }}
      />
    </div>
  );
}