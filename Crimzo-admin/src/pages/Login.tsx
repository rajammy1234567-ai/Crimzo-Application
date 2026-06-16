import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';

const Login = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(password);
            navigate('/dashboard');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Invalid password';
            setError(message);
            setPassword('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-crimzo/5 via-transparent to-transparent" />

            <div className="relative w-full max-w-md">
                <div className="bg-dark-card border border-dark-border rounded-2xl p-8 shadow-2xl">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 bg-gradient-to-br from-crimzo to-crimzo-dark rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-crimzo/20">
                            <Shield className="text-white w-7 h-7" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">
                            CRIMZO <span className="text-crimzo">Admin</span>
                        </h1>
                        <p className="text-sm text-gray-500 mt-2">Secure access to platform management</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2 block">
                                Master Password
                            </label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-dark-bg border border-dark-border rounded-xl pl-11 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-crimzo/50 transition-colors"
                                    placeholder="Enter admin password"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl text-center">
                                {error}
                            </div>
                        )}

                        <Button type="submit" loading={loading} size="lg" className="w-full">
                            Sign In to Console
                        </Button>
                    </form>
                </div>

                <p className="text-center text-xs text-gray-600 mt-6">
                    Authorized personnel only. All actions are logged.
                </p>
            </div>
        </div>
    );
};

export default Login;