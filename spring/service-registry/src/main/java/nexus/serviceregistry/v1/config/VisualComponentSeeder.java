package nexus.serviceregistry.v1.config;

import nexus.serviceregistry.v1.entity.VisualComponent;
import nexus.serviceregistry.v1.repository.VisualComponentRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;
import java.util.List;

@Configuration
public class VisualComponentSeeder {

    @Bean
    CommandLineRunner initVisualComponents(VisualComponentRepository repository) {
        return args -> {
            if (repository.count() == 0) {
                List<VisualComponent> defaults = Arrays.asList(
                        // --- API Services ---
                        create("rest-api", "REST API Service", "tall-cylinder", 0x0ea5e9L, 2.0, "rounded-sm",
                                "bg-sky-500"),
                        create("graphql-api", "GraphQL API", "icosahedron", 0xe11d48L, 2.0, "rounded-full",
                                "bg-rose-600"),
                        create("grpc-service", "gRPC Service", "box", 0x0d9488L, 1.5, "rounded-sm", "bg-teal-600"),
                        create("background-job", "Background Job", "octahedron", 0xeab308L, 1.3, "rotate-45",
                                "bg-yellow-500"),

                        // --- Infrastructure ---
                        create("gateway", "API Gateway", "octahedron", 0xa855f7L, 2.5, "rotate-45", "bg-purple-500"),
                        create("proxy", "Reverse Proxy", "torus", 0x10b981L, 2.0,
                                "rounded-full ring-4 ring-emerald-500", "bg-transparent"),
                        create("message-queue", "Message Queue", "torus", 0xf97316L, 2.0, "rounded-full ring-2",
                                "bg-orange-500"),
                        create("jms-queue", "JMS Queue", "torus", 0xf59e0bL, 2.0, "rounded-full ring-2 border-dashed",
                                "bg-amber-500"),

                        // --- Storage ---
                        create("database", "Database", "cylinder", 0x334155L, 2.0, "rounded-b-md rounded-t-md",
                                "bg-slate-700 h-5"),
                        create("cache", "Cache Service", "box", 0xdc2626L, 1.2, "rounded-sm", "bg-red-600"),

                        // --- Clients ---
                        create("web-app", "Web Application", "sphere", 0x2563ebL, 1.5, "rounded-full", "bg-blue-600"));

                repository.saveAll(defaults);
                System.out.println("Seeded default Visual Components");
            }
        };
    }

    private VisualComponent create(String type, String name, String geometry, Long color, Double scale, String icon,
            String colorClass) {
        VisualComponent vc = new VisualComponent();
        vc.setType(type);
        vc.setName(name);
        vc.setGeometry(geometry);
        vc.setDefaultColor(color);
        vc.setScale(scale);
        vc.setIconClass(icon);
        vc.setColorClass(colorClass);
        vc.setIsSystem(true);
        vc.setDescription("System default component");
        return vc;
    }
}
