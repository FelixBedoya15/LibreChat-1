import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { useToastContext } from '@librechat/client';
import { BookOpen, CheckCircle, Clock, Shield, Play, Info, ChevronLeft, ChevronRight, Zap, GraduationCap, X, Plus } from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';
import { OpenSidebar } from '~/components/Chat/Menus';
import type { ContextType } from '~/common';
import { sanitizeSlug } from '~/utils/slug';

// --- Sub-components ---

const CourseModal = ({ course, onClose, navigate }: { course: any, onClose: () => void, navigate: any }) => {
    if (!course) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose}>
            <div 
                className="bg-surface-primary border border-border-light dark:border-white/10 rounded-2xl overflow-hidden w-full max-w-4xl shadow-2xl relative flex flex-col md:flex-row animate-fade-in scale-95 md:scale-100"
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button */}
                <button onClick={onClose} className="absolute top-4 right-4 z-20 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 backdrop-blur-md transition-colors">
                    <X size={20} />
                </button>

                {/* Image Section */}
                <div className="w-full md:w-2/5 h-56 md:h-auto relative bg-surface-tertiary flex-shrink-0">
                    {course.thumbnail ? (
                        <img 
                            src={course.thumbnail.startsWith('http') || course.thumbnail.startsWith('/') ? course.thumbnail : `/images/${course.thumbnail.split('/').pop()}`} 
                            alt={course.title} 
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-tertiary to-surface-secondary">
                            <BookOpen className="w-16 h-16 text-text-tertiary" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-surface-primary" />
                </div>

                {/* Content Section */}
                <div className="w-full md:w-3/5 p-6 md:p-8 flex flex-col max-h-[80vh] md:max-h-[70vh]">
                    <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
                        {course.tags && course.tags.map((tag: string, i: number) => (
                            <span key={i} className="bg-[#10b981]/10 text-[#10b981] text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest border border-[#10b981]/20">
                                {tag}
                            </span>
                        ))}
                    </div>
                    
                    <h2 className="text-2xl md:text-3xl font-black text-text-primary mb-4 leading-tight shrink-0">
                        {course.title}
                    </h2>
                    
                    <div className="flex-1 overflow-y-auto pr-2 mb-6 no-scrollbar">
                        <p className="text-sm md:text-base text-text-secondary leading-relaxed whitespace-pre-wrap">
                            {course.description || 'Sin descripción detallada disponible para este curso.'}
                        </p>
                    </div>

                    <div className="mt-auto pt-5 border-t border-border-light dark:border-white/5 flex items-center justify-between shrink-0">
                        <button 
                            onClick={() => { onClose(); navigate(`/ruta-aprendizaje/${course._id}/${sanitizeSlug(course.title)}`); }}
                            className="flex items-center gap-2 bg-[#10b981] text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#059669] transition-all hover:scale-105 shadow-lg shadow-[#10b981]/20"
                        >
                            <Play size={18} className="fill-white" /> Iniciar Curso
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const CourseCard = ({ course, navigate, onMoreInfo }: { course: any, navigate: any, onMoreInfo?: () => void }) => {
    return (
        <div 
            onClick={() => navigate(`/ruta-aprendizaje/${course._id}/${sanitizeSlug(course.title)}`)}
            className="group relative flex-none w-56 sm:w-64 md:w-80 aspect-video rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:z-10 shadow-lg border border-border-light dark:border-white/5"
        >
            {/* Thumbnail */}
            <div className="absolute inset-0 bg-surface-tertiary">
                {course.thumbnail ? (
                    <img 
                        src={course.thumbnail.startsWith('http') || course.thumbnail.startsWith('/') ? course.thumbnail : `/images/${course.thumbnail.split('/').pop()}`} 
                        alt={course.title} 
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-tertiary to-surface-secondary">
                        <BookOpen className="w-10 h-10 text-text-tertiary" />
                    </div>
                )}
            </div>

            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

            {/* Content Overlay */}
            <div className="absolute inset-0 p-3 sm:p-4 flex flex-col justify-end transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <div className="flex items-center gap-2 mb-1">
                    {course.tags && course.tags[0] && (
                        <span className="bg-white/20 backdrop-blur-md text-white text-[7px] sm:text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">
                            {course.tags[0]}
                        </span>
                    )}
                </div>
                <h3 className="text-white font-bold text-xs sm:text-sm md:text-base line-clamp-2 drop-shadow-md">
                    {course.title}
                </h3>
            </div>
            
            {/* Hover Action Info */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onMoreInfo) onMoreInfo();
                    }}
                    className="bg-black/40 hover:bg-black/60 backdrop-blur-md p-1.5 rounded-full border border-white/20 transition-colors"
                    title="Más Información"
                >
                    <Info size={14} className="text-white" />
                </button>
            </div>
        </div>
    );
};

const CourseRow = ({ title, courses, navigate, onMoreInfo }: { title: string, courses: any[], navigate: any, onMoreInfo?: (course: any) => void }) => {
    const rowRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (rowRef.current) {
            const { scrollLeft, clientWidth } = rowRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth * 0.8 : scrollLeft + clientWidth * 0.8;
            rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    if (courses.length === 0) return null;

    return (
        <div className="mb-6 sm:mb-8 md:mb-12 group/row relative">
            <h2 className="text-sm sm:text-lg md:text-2xl font-black text-text-primary mb-3 sm:mb-4 px-4 sm:px-6 md:px-12 tracking-tight flex items-center gap-2 sm:gap-3">
                <span className="w-1 h-4 sm:w-1.5 sm:h-6 bg-[#10b981] rounded-full" />
                {title}
            </h2>
            
            {/* Scroll Buttons */}
            <button 
                onClick={() => scroll('left')}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 opacity-0 group-hover/row:opacity-100 transition-all hover:bg-black/80 hover:scale-110 hidden sm:flex items-center justify-center text-white shadow-2xl"
            >
                <ChevronLeft size={24} />
            </button>
            <button 
                onClick={() => scroll('right')}
                className="absolute right-2 sm:left-auto sm:right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 opacity-0 group-hover/row:opacity-100 transition-all hover:bg-black/80 hover:scale-110 hidden sm:flex items-center justify-center text-white shadow-2xl"
            >
                <ChevronRight size={24} />
            </button>

            <div 
                ref={rowRef}
                className="flex gap-3 sm:gap-4 overflow-x-auto px-4 sm:px-6 md:px-12 pb-4 pt-2 no-scrollbar scroll-smooth"
            >
                {courses.map(course => (
                    <CourseCard key={course._id} course={course} navigate={navigate} onMoreInfo={onMoreInfo ? () => onMoreInfo(course) : undefined} />
                ))}
            </div>
        </div>
    );
};

const FeaturedHero = ({ course, navigate, onMoreInfo }: { course: any, navigate: any, onMoreInfo: () => void }) => {
    if (!course) return null;

    return (
        <div className="relative w-full h-screen overflow-hidden flex flex-col justify-end pb-16 sm:pb-20 md:pb-28">
            {/* Background Image */}
            <div className="absolute inset-0">
                {course.thumbnail ? (
                    <img 
                        src={course.thumbnail.startsWith('http') || course.thumbnail.startsWith('/') ? course.thumbnail : `/images/${course.thumbnail.split('/').pop()}`} 
                        alt={course.title} 
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-surface-primary via-surface-secondary to-surface-primary" />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 sm:from-black/80 via-black/50 sm:via-black/40 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-primary via-surface-primary/20 to-transparent" />
            </div>

            {/* Content */}
            <div className="relative px-4 sm:px-6 md:px-12 max-w-4xl z-10 pt-24">
                <div className="flex items-center gap-2 mb-3 sm:mb-4 animate-fade-in">
                    <span className="bg-[#10b981] text-white text-[8px] sm:text-[10px] md:text-xs font-black px-1.5 sm:px-2 py-0.5 sm:py-1 rounded uppercase tracking-widest flex items-center gap-1 sm:gap-1.5 shadow-lg">
                        <Zap size={12} className="fill-white hidden sm:block" /> DESTACADO
                    </span>
                    {course.tags && course.tags[0] && (
                        <span className="bg-white/10 backdrop-blur-md text-white text-[8px] sm:text-[10px] md:text-xs font-black px-1.5 sm:px-2 py-0.5 sm:py-1 rounded uppercase tracking-widest border border-white/10 shadow-lg">
                            {course.tags[0]}
                        </span>
                    )}
                </div>
                
                <h1 className="text-xl sm:text-2xl md:text-4xl font-black text-white mb-3 sm:mb-5 leading-tight drop-shadow-2xl line-clamp-3">
                    {course.title}
                </h1>
                
                <p className="text-xs sm:text-base md:text-xl text-gray-200/90 mb-6 sm:mb-8 line-clamp-2 sm:line-clamp-3 leading-relaxed drop-shadow-md max-w-2xl">
                    {course.description || 'Explora esta ruta personalizada diseñada para tu organización.'}
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                    <button 
                        onClick={() => navigate(`/ruta-aprendizaje/${course._id}/${sanitizeSlug(course.title)}`)}
                        className="flex items-center justify-center gap-2 sm:gap-3 bg-white text-black px-5 sm:px-8 py-2.5 sm:py-3.5 rounded-xl font-black text-sm sm:text-lg hover:bg-gray-200 transition-all transform active:scale-95 shadow-xl"
                    >
                        <Play size={18} className="fill-black" /> Iniciar Ahora
                    </button>
                    <button 
                        onClick={onMoreInfo}
                        className="flex items-center justify-center gap-2 sm:gap-3 bg-gray-500/40 backdrop-blur-xl text-white px-5 sm:px-8 py-2.5 sm:py-3.5 rounded-xl font-black text-sm sm:text-lg hover:bg-gray-500/60 transition-all border border-white/10 active:scale-95 shadow-xl"
                    >
                        <Info size={18} /> Más Información
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function RutaAprendizajeDashboard({ hideFloatingHeader = false }: { hideFloatingHeader?: boolean } = {}) {
    const [courses, setCourses] = useState<any[]>([]);
    const [categorizedCourses, setCategorizedCourses] = useState<Record<string, any[]>>({});
    const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
    const [featuredCourse, setFeaturedCourse] = useState<any>(null);
    const [selectedCourse, setSelectedCourse] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToastContext();
    const navigate = useNavigate();
    const { user } = useAuthContext();
    const ADMIN_EMAILS = ['cristhian@mauricioposadac.com', 'mauricioposadac@gmail.com', 'felix.bedoya15@gmail.com'];
    const isAdmin = user?.role === 'ADMIN' || (!!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
    const isProOrAdmin = isAdmin || user?.role === 'USER_PRO' || user?.role === 'USER_CUSTOM' || Boolean(user?.isSubUser);
    const outletContext = useOutletContext<ContextType>();
    const navVisible = outletContext?.navVisible ?? true;
    const setNavVisible = outletContext?.setNavVisible ?? (() => {});

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                // Admins load courses using their admin routes
                const response = await axios.get('/api/ruta-aprendizaje/admin/courses');
                const data = response.data;

                const sorted = [...data].sort((a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setCourses(sorted);

                const categories: Record<string, any[]> = {};
                const order: string[] = [];

                sorted.forEach((course: any) => {
                    const tags: string[] = course.tags || [];
                    if (tags.length === 0) {
                        const key = 'Otros';
                        if (!categories[key]) { categories[key] = []; order.push(key); }
                        categories[key].push(course);
                    } else {
                        tags.forEach((tag: string) => {
                            const key = tag.trim();
                            if (!key) return;
                            if (!categories[key]) { categories[key] = []; order.push(key); }
                            categories[key].push(course);
                        });
                    }
                });

                setCategorizedCourses(categories);
                setCategoryOrder(order);

                const featured = sorted.find((c: any) => c.isFeatured)
                    || sorted.find((c: any) => c.thumbnail)
                    || sorted[0]
                    || null;
                setFeaturedCourse(featured);

            } catch (error) {
                console.error('Error fetching courses:', error);
                showToast({ message: 'Error al cargar los cursos.', status: 'error' });
            } finally {
                setLoading(false);
            }
        };

        fetchCourses();
    }, [showToast]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full bg-surface-primary">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#10b981]"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-surface-primary text-text-primary overflow-hidden">
            {/* Header / Nav Overlay */}
            {!hideFloatingHeader && (
                <div className="absolute top-0 left-0 right-0 z-50 p-4 pt-16 sm:p-6 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-3 sm:gap-4 pointer-events-auto">
                        {!navVisible && (
                            <div className="hidden md:block">
                                <OpenSidebar setNavVisible={setNavVisible} />
                            </div>
                        )}
                        <div className="flex items-center gap-2 sm:gap-3 bg-surface-primary/40 dark:bg-black/20 backdrop-blur-md px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-border-light dark:border-white/5 shadow-xl">
                            <GraduationCap className="text-[#10b981] w-5 h-5 sm:w-6 sm:h-6" />
                            <h1 className="font-black tracking-tight text-sm sm:text-base md:text-xl">Ruta de aprendizaje</h1>
                        </div>
                    </div>

                    {isProOrAdmin && (
                        <div className="flex items-center gap-2 pointer-events-auto">
                            <button
                                onClick={() => navigate('/ruta-aprendizaje/admin/courses/new')}
                                className="group flex items-center gap-1.5 bg-[#10b981] hover:bg-[#059669] text-white px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full transition-all duration-300 shadow-xl font-bold text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer"
                                title="Crear nueva ruta o curso"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Crear Curso</span>
                            </button>
                            <button
                                onClick={() => navigate('/ruta-aprendizaje/admin')}
                                className="group flex items-center gap-2 bg-surface-primary/40 dark:bg-white/10 backdrop-blur-md px-3.5 sm:px-4 py-1.5 sm:py-2 border border-border-light dark:border-white/10 hover:bg-surface-hover dark:hover:bg-white/20 text-text-primary rounded-full transition-all duration-300 shadow-xl cursor-pointer"
                                title="Administrar rutas de aprendizaje"
                            >
                                <Shield className="w-4 h-4 text-[#10b981]" />
                                <span className="font-bold text-[10px] sm:text-xs uppercase tracking-wider">Administrar</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
                {courses.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-text-secondary max-w-md mx-auto pt-44">
                        <GraduationCap className="w-16 h-16 text-[#10b981] mb-4" />
                        <h2 className="font-bold text-2xl mb-2">No hay rutas creadas</h2>
                        <p className="text-sm text-text-tertiary mb-6">Tu empresa no cuenta con rutas de aprendizaje publicadas por el momento.</p>
                        {isProOrAdmin && (
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                <button
                                    onClick={() => navigate('/ruta-aprendizaje/admin/courses/new')}
                                    className="px-6 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl font-bold transition-all transform active:scale-95 shadow-lg flex items-center gap-2 cursor-pointer text-sm"
                                >
                                    <Plus size={18} /> Crear Curso o Ruta
                                </button>
                                <button
                                    onClick={() => navigate('/ruta-aprendizaje/admin')}
                                    className="px-6 py-2.5 bg-surface-primary hover:bg-surface-hover text-text-primary border border-border-medium rounded-xl font-semibold transition-all shadow flex items-center gap-2 cursor-pointer text-sm"
                                >
                                    <Shield size={18} className="text-[#10b981]" /> Panel de Gestión
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Hero Section */}
                        <FeaturedHero course={featuredCourse} navigate={navigate} onMoreInfo={() => setSelectedCourse(featuredCourse)} />

                        {/* Dynamic Rows */}
                        <div className="relative -mt-8 sm:-mt-16 md:-mt-24 pb-24 z-30">
                            {categoryOrder.map(title => (
                                <CourseRow
                                    key={title}
                                    title={title}
                                    courses={categorizedCourses[title] || []}
                                    navigate={navigate}
                                    onMoreInfo={setSelectedCourse}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Modals */}
            <CourseModal course={selectedCourse} onClose={() => setSelectedCourse(null)} navigate={navigate} />

            {/* Global Styles */}
            <style dangerouslySetInnerHTML={{ __html: `
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.8s ease-out forwards;
                }
            ` }} />
        </div>
    );
}
