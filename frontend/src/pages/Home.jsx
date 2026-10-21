import { useNavigate } from "react-router-dom";
import { Crown, Users, User, Calendar } from "lucide-react";
import { Button } from "../components/ui/button";
import { motion } from "framer-motion";
import { KidMascot } from "../components/KidMascot";

const modes = [
  { title: "Odaya Gir", description: "Oda koduna qoşularaq dostlarınla oyna", icon: Users, path: "/join-room", gradient: "from-emerald-600 to-teal-600" },
  { title: "Oda Qur", description: "Yeni oda yarat və idarə et", icon: Crown, path: "/create-room", gradient: "from-indigo-600 to-purple-600" },
  { title: "Tək Oyun", description: "Təsadüfi sözlə tək oyna", icon: User, path: "/solo", gradient: "from-blue-600 to-cyan-600" },
  { title: "Günlük Oyun", description: "Hamı ilə eyni sözü tap", icon: Calendar, path: "/daily", gradient: "from-orange-600 to-red-600" }
];

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-6xl w-full">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <div className="flex items-center justify-center mb-4 gap-3 md:gap-4 flex-wrap">
            <img
              src="https://i.imgur.com/d63Fsdo.png"
              alt="CoolabSchool logo"
              data-testid="coolabschool-logo"
              className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl object-contain shadow-2xl border-4 border-white/20 bg-white/5 transform -rotate-6 hover:rotate-0 transition-transform duration-300"
            />
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              CoolabSchool
            </h1>
          </div>
          <p className="text-lg md:text-xl text-cyan-400 mb-2 font-semibold flex items-center justify-center gap-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Sizi Salamlayır <span className="text-2xl">👋</span>
          </p>
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 blur-lg opacity-50 animate-pulse"></div>
            <p className="relative text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent flex items-center justify-center gap-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Oyuna Xoş Gəlimişsiniz ✨
            </p>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {modes.map((mode, index) => (
            <motion.div
              key={mode.path}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              className="relative group"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${mode.gradient} rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity`} />
              <div
                data-testid={`${mode.path.slice(1)}-card`}
                onClick={() => navigate(mode.path)}
                className="relative bg-slate-900/40 hover:bg-slate-900/60 backdrop-blur-xl border border-white/30 rounded-3xl p-8 cursor-pointer transition-colors"
              >
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className={`p-6 bg-gradient-to-br ${mode.gradient} rounded-full opacity-80`}>
                    <mode.icon className="w-16 h-16 text-white" />
                  </div>
                  <h2 className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>{mode.title}</h2>
                  <p className="text-lg text-white/70" style={{ fontFamily: 'Manrope, sans-serif' }}>{mode.description}</p>
                  <Button
                    data-testid={`${mode.path.slice(1)}-button`}
                    className={`w-full bg-gradient-to-r ${mode.gradient} hover:opacity-90 text-white h-14 text-lg rounded-full font-bold shadow-lg`}
                    onClick={(e) => { e.stopPropagation(); navigate(mode.path); }}
                  >
                    Başla
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="flex flex-col items-center gap-4">
          <Button
            data-testid="host-panel-button"
            onClick={() => navigate('/host')}
            className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white h-14 px-8 text-lg rounded-full font-semibold"
          >
            <Crown className="w-5 h-5 mr-2" />
            Host Panel
          </Button>
          <p className="text-xs text-white/30 font-light" style={{ fontFamily: 'Manrope, sans-serif' }}>By Elnur Calalov</p>
        </motion.div>
      </div>
      <KidMascot mood="wave" />
    </div>
  );
};

export default Home;
