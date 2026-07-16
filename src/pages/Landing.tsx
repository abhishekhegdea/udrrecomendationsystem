import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/Container'
import {
  Truck, Shield, Globe, Award, Heart, CheckCircle2, Star, IndianRupee, ArrowRight
} from 'lucide-react'

const features = [
  { icon: IndianRupee, title: 'Weekly Payouts', desc: 'Get your earnings transferred directly to your bank account every week without fail.' },
  { icon: Shield, title: 'Insurance Cover', desc: 'Medical insurance of up to ₹ 10 lacs to keep you and your family completely safe and secure.' },
  { icon: Globe, title: 'Flexible Hours', desc: 'Be your own boss. Log in when you want and work as much or as little as you choose.' },
  { icon: Heart, title: 'Support Artisans', desc: 'Take pride in delivering delicate, hand-crafted goods to customers who appreciate true art.' },
]

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#fafafa] font-sans selection:bg-primary/30">
      
      {/* ═══ NAVBAR ═══ */}
      <nav className="absolute top-0 left-0 right-0 z-50 py-5">
        <Container className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-primary flex items-center justify-center shadow-[0_4px_14px_0_rgba(249,176,0,0.39)]">
              <Truck className="h-5 w-5 text-black" />
            </div>
            <span className="text-2xl font-black text-white tracking-tight drop-shadow-md">
              UdrCrafts
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 bg-black/20 backdrop-blur-md px-8 py-3 rounded-full border border-white/10">
            {['Home', 'About Us', 'Careers', 'Blog'].map((item) => (
              <button key={item} className="text-sm font-semibold text-white hover:text-primary transition-colors">
                {item}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/login')} className="hidden sm:block text-sm font-bold text-white hover:text-primary transition-colors drop-shadow-md">
              Partner Login
            </button>
          </div>
        </Container>
      </nav>

      {/* ═══ HERO SECTION ═══ */}
      <section 
        className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 min-h-[90vh] flex items-center bg-cover bg-center overflow-hidden"
        style={{ backgroundImage: "url('/images/login-bg.jpg')" }}
      >
        {/* Cinematic Dark Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30 backdrop-blur-[2px]" />
        
        <Container className="relative z-10 w-full">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-16 lg:gap-8">
            
            {/* Left Content (Text) */}
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex-1 text-center lg:text-left pt-10 lg:pt-0 max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 backdrop-blur-md rounded-full text-sm font-bold text-primary mb-6 border border-primary/30 shadow-lg">
                <Star className="h-4 w-4 fill-primary" />
                Rated 4.9/5 by our Delivery Partners
              </div>

              <h1 className="text-5xl lg:text-7xl font-black text-white leading-[1.1] mb-6 tracking-tight drop-shadow-2xl">
                Earn upto <span className="text-primary">₹ 50,000</span><br/> with UdrCrafts.
              </h1>
              
              <p className="text-xl lg:text-2xl text-gray-200 font-medium leading-relaxed mb-8 drop-shadow-lg">
                JOINING BONUS of upto <span className="text-white font-bold">₹ 4,000</span> | Upto <span className="text-white font-bold">₹ 10 lacs</span> medical insurance
              </p>

              <div className="flex items-center justify-center lg:justify-start gap-8 mt-10 text-white">
                <div className="flex flex-col items-center lg:items-start">
                  <p className="text-3xl font-black text-primary">10k+</p>
                  <p className="text-sm font-medium text-gray-300">Active Partners</p>
                </div>
                <div className="w-px h-12 bg-white/20"></div>
                <div className="flex flex-col items-center lg:items-start">
                  <p className="text-3xl font-black text-primary">40+</p>
                  <p className="text-sm font-medium text-gray-300">Cities Live</p>
                </div>
              </div>
            </motion.div>

            {/* Right Content (Form Card) */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="w-full max-w-md"
            >
              <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 relative overflow-hidden">
                {/* Decorative blob inside card */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
                
                <h2 className="text-3xl font-black text-[#111111] mb-2 tracking-tight">Become a rider</h2>
                <p className="text-gray-500 font-medium mb-8">To deliver orders for UdrCrafts, please fill this form</p>
                
                <form onSubmit={(e) => { e.preventDefault(); navigate('/signup'); }} className="space-y-5 relative z-10">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Input placeholder="Name*" className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-primary transition-all rounded-xl shadow-sm" required />
                    </div>
                    <div>
                      <Input placeholder="Phone*" type="tel" className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-primary transition-all rounded-xl shadow-sm" required />
                    </div>
                  </div>
                  
                  <div className="relative">
                    <select className="w-full h-12 px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-gray-50 focus:bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none transition-all shadow-sm cursor-pointer" required>
                      <option value="" disabled selected>Select your city*</option>
                      <option value="bangalore">Bangalore</option>
                      <option value="mumbai">Mumbai</option>
                      <option value="delhi">Delhi</option>
                      <option value="pune">Pune</option>
                    </select>
                    {/* Custom Dropdown Arrow */}
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-14 mt-4 bg-[#111111] hover:bg-black text-white text-lg font-bold rounded-xl shadow-[0_8px_20px_rgba(17,17,17,0.2)] hover:shadow-[0_8px_25px_rgba(17,17,17,0.3)] hover:-translate-y-0.5 transition-all duration-200">
                    Join to earn
                  </Button>
                  
                  <div className="pt-6 flex justify-center border-t border-gray-100 mt-6">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" className="h-11 opacity-90 hover:opacity-100 hover:scale-105 cursor-pointer transition-all duration-200" />
                  </div>
                </form>
              </div>
            </motion.div>
            
          </div>
        </Container>
      </section>

      {/* ═══ WHY CHOOSE US ═══ */}
      <section className="py-24 lg:py-32 bg-white relative">
        <Container>
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl lg:text-5xl font-black text-[#111111] mb-6 tracking-tight">
              Empowering the <span className="text-primary relative inline-block">Crafting Community<svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none"><path d="M3 9C58 3 148 0 297 6" stroke="#F9B000" strokeWidth="3" strokeLinecap="round" opacity="0.6"/></svg></span>
            </h2>
            <p className="text-xl text-gray-500 font-medium leading-relaxed">
              UdrCrafts is the premier marketplace for local artisans. By partnering with us, you are not just delivering packages; you are delivering creativity and passion.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true, margin: "-50px" }}
                className="group p-8 rounded-[24px] bg-white border border-gray-100 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-15px_rgba(249,176,0,0.2)] hover:border-primary/30 transition-all duration-300 hover:-translate-y-2"
              >
                <div className="w-16 h-16 rounded-[16px] bg-gray-50 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:scale-110 transition-all duration-300">
                  <feature.icon className="h-8 w-8 text-black" />
                </div>
                <h3 className="text-xl font-black text-[#111111] mb-3">{feature.title}</h3>
                <p className="text-gray-500 font-medium leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* ═══ CALL TO ACTION ═══ */}
      <section className="py-24 bg-gray-50">
        <Container>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="bg-[#111111] rounded-[40px] p-12 lg:p-20 text-center relative overflow-hidden shadow-2xl"
          >
            {/* Background design elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none -mr-40 -mt-40" />
            
            <div className="relative z-10 max-w-4xl mx-auto">
              <h2 className="text-4xl lg:text-6xl font-black text-white mb-6 tracking-tight">
                Ready to hit the road?
              </h2>
              <p className="text-xl text-gray-400 font-medium mb-12 max-w-2xl mx-auto">
                Join our fleet of delivery partners today and start earning with absolute flexibility.
              </p>
              <Button size="xl" className="h-16 px-10 text-xl font-black bg-primary text-black hover:bg-primary-dark shadow-[0_8px_30px_rgba(249,176,0,0.4)] hover:-translate-y-1 transition-all rounded-2xl" onClick={() => navigate('/signup')}>
                Register Now <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
            </div>
          </motion.div>
        </Container>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-white py-16 border-t border-gray-100">
        <Container>
          <div className="grid md:grid-cols-4 gap-12 lg:gap-24 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-[14px] bg-primary flex items-center justify-center">
                  <Truck className="h-6 w-6 text-black" />
                </div>
                <span className="text-2xl font-black text-black tracking-tight">
                  UdrCrafts
                </span>
              </div>
              <p className="text-gray-500 font-medium max-w-sm leading-relaxed">
                Delivering creativity across India. We connect the finest artisans with customers who value true craftsmanship.
              </p>
            </div>
            
            <div>
              <h4 className="font-black text-[#111111] text-lg mb-6 tracking-tight">Company</h4>
              <ul className="space-y-4 font-medium text-gray-500">
                <li><a href="#" className="hover:text-primary hover:translate-x-1 inline-block transition-transform">About Us</a></li>
                <li><a href="#" className="hover:text-primary hover:translate-x-1 inline-block transition-transform">Careers</a></li>
                <li><a href="#" className="hover:text-primary hover:translate-x-1 inline-block transition-transform">Blog</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-black text-[#111111] text-lg mb-6 tracking-tight">Partners</h4>
              <ul className="space-y-4 font-medium text-gray-500">
                <li><a href="#" className="hover:text-primary hover:translate-x-1 inline-block transition-transform" onClick={() => navigate('/login')}>Partner Login</a></li>
                <li><a href="#" className="hover:text-primary hover:translate-x-1 inline-block transition-transform" onClick={() => navigate('/signup')}>Register</a></li>
                <li><a href="#" className="hover:text-primary hover:translate-x-1 inline-block transition-transform">Support Guidelines</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4 text-sm font-medium text-gray-400">
            <p>© {new Date().getFullYear()} UdrCrafts Technologies Pvt. Ltd.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-[#111111] transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-[#111111] transition-colors">Terms of Service</a>
            </div>
          </div>
        </Container>
      </footer>
    </div>
  )
}
