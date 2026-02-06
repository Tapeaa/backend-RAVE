/**
 * Modal de mot de passe oublié
 * S'affiche directement sur la page de connexion
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useLocation } from "wouter";

const phoneSchema = z.object({
  phone: z.string()
    .min(6, "Minimum 6 chiffres")
    .max(8, "Maximum 8 chiffres")
    .regex(/^\d+$/, "Uniquement des chiffres"),
});

const codeSchema = z.object({
  code: z.string().length(6, "Code à 6 chiffres requis"),
});

const passwordSchema = z.object({
  newPassword: z.string()
    .min(6, "Minimum 6 caractères")
    .regex(/[a-zA-Z]/, "Doit contenir au moins une lettre")
    .regex(/[0-9]/, "Doit contenir au moins un chiffre"),
  confirmPassword: z.string().min(6, "Confirmez le mot de passe"),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

type PhoneForm = z.infer<typeof phoneSchema>;
type CodeForm = z.infer<typeof codeSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

type Step = "phone" | "code" | "password";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { login, setClientDirectly } = useAuth();
  const [, setLocation] = useLocation();

  const handleClose = () => {
    setStep("phone");
    setPhone("");
    phoneForm.reset();
    codeForm.reset();
    passwordForm.reset();
    onClose();
  };

  const phoneForm = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const codeForm = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  // Réinitialiser le modal quand il s'ouvre
  useEffect(() => {
    if (isOpen) {
      setStep("phone");
      setPhone("");
      phoneForm.reset();
      codeForm.reset();
      passwordForm.reset();
    }
  }, [isOpen]);

  const handlePhoneSubmit = async (data: PhoneForm) => {
    setIsLoading(true);
    try {
      const phoneNumber = `+689${data.phone.replace(/\s/g, "")}`;
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber }),
      });
      const result = await res.json();
      
      if (result.success) {
        setPhone(phoneNumber);
        setStep("code");
        toast({
          title: "Code envoyé",
          description: "Un code de vérification a été envoyé via notification",
        });
      } else {
        toast({
          title: "Erreur",
          description: result.error || "Une erreur est survenue",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeSubmit = async (data: CodeForm) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: data.code }),
      });
      const result = await res.json();
      
      if (result.success) {
        setStep("password");
        toast({
          title: "Code validé",
          description: "Entrez votre nouveau mot de passe",
        });
      } else {
        toast({
          title: "Erreur",
          description: result.error || "Code invalide ou expiré",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de vérifier le code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (data: PasswordForm) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          code: codeForm.getValues("code"),
          newPassword: data.newPassword,
        }),
      });
      const result = await res.json();
      
      if (result.success) {
        // Connexion automatique si le serveur a créé une session
        if (result.client) {
          // Le serveur a déjà créé la session, on met à jour le contexte
          setClientDirectly(result.client);
          toast({
            title: "Mot de passe réinitialisé",
            description: "Vous êtes maintenant connecté",
          });
            handleClose();
            setLocation("/");
        } else {
          // Fallback : essayer de se connecter avec le nouveau mot de passe
          const loginResult = await login(phone, data.newPassword);
          if (loginResult.success) {
            toast({
              title: "Mot de passe réinitialisé",
              description: "Vous êtes maintenant connecté",
            });
            handleClose();
            setLocation("/");
          } else {
            toast({
              title: "Mot de passe réinitialisé",
              description: "Vous pouvez maintenant vous connecter",
            });
            handleClose();
          }
        }
      } else {
        toast({
          title: "Erreur",
          description: result.error || "Impossible de réinitialiser le mot de passe",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de réinitialiser le mot de passe",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type: "password_reset" }),
      });
      const data = await res.json();
      
      if (data.success) {
        toast({
          title: "Code envoyé",
          description: "Un nouveau code a été envoyé",
        });
      } else {
        toast({
          title: "Erreur",
          description: data.error || "Impossible d'envoyer le code",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le code",
        variant: "destructive",
      });
    }
  };

  const formatPhone = (phone: string) => {
    const digits = phone.replace("+689", "");
    return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {step === "phone" && "Mot de passe oublié"}
            {step === "code" && "Code de vérification"}
            {step === "password" && "Nouveau mot de passe"}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === "phone" && (
            <>
              <p className="text-gray-600 text-sm mb-6">
                Nous allons vous envoyer un code de vérification à 6 chiffres via notification 
                sur votre téléphone pour réinitialiser votre mot de passe.
              </p>
              <Form {...phoneForm}>
                <form onSubmit={phoneForm.handleSubmit(handlePhoneSubmit)} className="space-y-4">
                  <FormField
                    control={phoneForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Numéro de téléphone</FormLabel>
                        <FormControl>
                          <div className="flex items-center border rounded-lg overflow-hidden">
                            <div className="flex items-center gap-1 px-3 py-3 bg-muted border-r">
                              <span className="text-sm font-medium">PF</span>
                              <span className="text-sm text-muted-foreground">+689</span>
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <Input
                              {...field}
                              type="tel"
                              inputMode="numeric"
                              placeholder="87 12 34 56"
                              className="border-0 focus-visible:ring-0"
                              maxLength={8}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-[#F5C400] text-black hover:bg-[#e0b400] font-semibold h-12 rounded-full"
                    disabled={isLoading}
                  >
                    {isLoading ? "Envoi..." : "Envoyer le code"}
                  </Button>
                </form>
              </Form>
            </>
          )}

          {step === "code" && (
            <>
              <p className="text-gray-600 text-sm mb-6">
                Entrez le code de vérification à 6 chiffres envoyé sur +689 {formatPhone(phone)}
              </p>
              <Form {...codeForm}>
                <form onSubmit={codeForm.handleSubmit(handleCodeSubmit)} className="space-y-4">
                  <FormField
                    control={codeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700">Code de vérification</FormLabel>
                        <FormControl>
                          <div className="flex justify-center">
                            <InputOTP
                              maxLength={6}
                              value={field.value}
                              onChange={field.onChange}
                            >
                              <InputOTPGroup className="gap-2">
                                <InputOTPSlot index={0} className="w-9 h-11 text-lg border-gray-300 rounded-lg" />
                                <InputOTPSlot index={1} className="w-9 h-11 text-lg border-gray-300 rounded-lg" />
                                <InputOTPSlot index={2} className="w-9 h-11 text-lg border-gray-300 rounded-lg" />
                                <InputOTPSlot index={3} className="w-9 h-11 text-lg border-gray-300 rounded-lg" />
                                <InputOTPSlot index={4} className="w-9 h-11 text-lg border-gray-300 rounded-lg" />
                                <InputOTPSlot index={5} className="w-9 h-11 text-lg border-gray-300 rounded-lg" />
                              </InputOTPGroup>
                            </InputOTP>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-[#F5C400] text-black hover:bg-[#e0b400] font-semibold h-12 rounded-full"
                    disabled={isLoading}
                  >
                    {isLoading ? "Vérification..." : "Valider le code"}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleResendCode}
                    variant="ghost"
                    className="w-full text-gray-500"
                  >
                    Renvoyer le code
                  </Button>
                </form>
              </Form>
            </>
          )}

          {step === "password" && (
            <>
              <p className="text-gray-600 text-sm mb-6">
                Entrez votre nouveau mot de passe
              </p>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700">Nouveau mot de passe</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Min 6 car., 1 lettre, 1 chiffre"
                            className="h-12 rounded-lg"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700">Confirmer le mot de passe</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Confirmez votre mot de passe"
                            className="h-12 rounded-lg"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-[#F5C400] text-black hover:bg-[#e0b400] font-semibold h-12 rounded-full"
                    disabled={isLoading}
                  >
                    {isLoading ? "Réinitialisation..." : "Réinitialiser et se connecter"}
                  </Button>
                </form>
              </Form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
