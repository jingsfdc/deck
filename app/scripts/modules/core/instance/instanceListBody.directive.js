'use strict';

let angular = require('angular');

module.exports = angular.module('spinnaker.core.instance.instanceListBody.directive', [
  require('../cluster/filter/clusterFilter.service.js'),
  require('../cluster/filter/clusterFilter.model.js'),
])
  .directive('instanceListBody', function ($timeout, $filter, $rootScope, $state, $, _, clusterFilterService, ClusterFilterModel) {
    return {
      restrict: 'C',
      scope: {
        instances: '=',
        sortFilter: '=',
        hasLoadBalancers: '=',
        hasDiscovery: '=',
        showProviderHealth: '=',
        serverGroup: '=',
      },
      link: function (scope, elem) {
        var tooltipEnabled = false,
            renderedMultiselectInstances = [],
            instanceGroup = ClusterFilterModel.getOrCreateMultiselectInstanceGroup(scope.serverGroup),
            activeInstance = null;

        var base = elem.parent().inheritedData('$uiView').state;

        function toggleSelection(instanceId) {
          ClusterFilterModel.toggleMultiselectInstance(scope.serverGroup, instanceId);
        }

        function buildTableRowOpenTag(instance, activeClass) {
          return `<tr class="clickable instance-row${activeClass}" data-provider="${instance.provider}" data-instance-id="${instance.id}">`;
        }

        function buildInstanceCheckboxCell(instance) {
          let isChecked = ClusterFilterModel.instanceIsMultiselected(scope.serverGroup, instance.id);
          return  `<td class="no-hover"><input type="checkbox" data-instance-id="${instance.id}" ${isChecked ? "checked" : ""}/></td>`;
        }

        function buildInstanceIdCell(instance) {
          var status = instance.healthState;
          return `<td><span class="glyphicon glyphicon-${status}-triangle"></span>${instance.id}</td>`;
        }

        function buildLaunchTimeCell(instance) {
          return `<td>${$filter('timestamp')(instance.launchTime)}</td>`;
        }

        function buildZoneCell(instance) {
          return `<td>${instance.availabilityZone}</td>`;
        }

        function buildDiscoveryCell(discoveryStatus) {
          return `<td class="text-center small">${discoveryStatus}</td>`;
        }

        function buildProviderHealthCell(providerStatus) {
          return `<td class="text-center small">${providerStatus}</td>`;
        }

        function buildLoadBalancersCell(loadBalancers) {
          let row = '<td>';
          loadBalancers.forEach(function (loadBalancer) {
            var tooltip = loadBalancer.state === 'OutOfService' ? loadBalancer.description.replace(/"/g, '&quot;') : null;
            var icon = loadBalancer.state === 'InService' ? 'Up' : 'Down';

            if (tooltip) {
              tooltipEnabled = true;
              var tooltipAttrs= `data-toggle="tooltip" title="${tooltip}"`;
            }

            row += `<div ${tooltip ? tooltipAttrs : ""}><span class="glyphicon glyphicon-${icon}-triangle"></span>${loadBalancer.name}</div>`;
          });

          if (!loadBalancers.length) {
            row += '-';
          }
          row += '</td>';
          return row;
        }

        function instanceSorter(a1, b1) {
          let filterSplit = scope.sortFilter.instanceSort.key.split('-'),
              filterType = filterSplit.length === 1 ? filterSplit[0] : filterSplit[1],
              reverse = filterSplit.length === 2,
              a = reverse ? b1 : a1,
              b = reverse ? a1 : b1;

          switch(filterType) {
            case 'id':
              return a.id.localeCompare(b.id);
            case 'launchTime':
              return a.launchTime === b.launchTime ? a.id.localeCompare(b.id) : a.launchTime - b.launchTime;
            case 'availabilityZone':
              return a.availabilityZone === b.availabilityZone ?
                a.launchTime === b.launchTime ?
                  a.id.localeCompare(b.id) :
                a.launchTime - b.launchTime :
                a.availabilityZone.localeCompare(b.availabilityZone);
            case 'discoveryState':
              let aHealth = (a.health || []).filter((health) => health.type === 'Discovery'),
                  bHealth = (b.health || []).filter((health) => health.type === 'Discovery');
              if (aHealth.length && !bHealth.length) {
                return -1;
              }
              if (!aHealth.length && bHealth.length) {
                return 1;
              }
              return (!aHealth.length && !bHealth.length) || aHealth[0].state === bHealth[0].state ?
                a.launchTime === b.launchTime ?
                  a.id.localeCompare(b.id) :
                a.launchTime - b.launchTime :
                aHealth[0].state.localeCompare(bHealth[0].state);
            case 'loadBalancerSort':
              let aHealth2 = (a.health || []).filter((health) => health.type === 'LoadBalancer')
                    .sort((h1, h2) => h1.name.localeCompare(h2.name)),
                  bHealth2 = (b.health || []).filter((health) => health.type === 'LoadBalancer')
                    .sort((h1, h2) => h1.name.localeCompare(h2.name));
              if (aHealth2.length && !bHealth2.length) {
                return -1;
              }
              if (!aHealth2.length && bHealth2.length) {
                return 1;
              }
              let aHealthStr = aHealth2.map((h) => h.name + ':' + h.state).join(','),
                  bHealthStr = bHealth2.map((h) => h.name + ':' + h.state).join(',');
              return aHealthStr === bHealthStr ?
                a.launchTime === b.launchTime ?
                  a.id.localeCompare(b.id) :
                a.launchTime - b.launchTime :
                aHealthStr.localeCompare(bHealthStr);
            default:
              return -1;
          }
        }

        function renderInstances() {
          var instances = (scope.instances || [])
            .filter(clusterFilterService.shouldShowInstance)
            .sort(instanceSorter);

          renderedMultiselectInstances = instanceGroup.instanceIds.slice(0);

          let newHtml = instances.map(function (instance) {
            var loadBalancers = [],
              discoveryState = '',
              discoveryStatus = '-',
              loadBalancerSort = '',
              providerStatus = '',
              activeClass = ' ',
              healthMetrics = instance.health || [],
              params = {instanceId: instance.id, provider: instance.provider };
            if ($state.includes('**.instanceDetails', params)) {
              activeClass = ' active';
              activeInstance = params;
            }

            healthMetrics.forEach(function (health) {
              if (scope.hasLoadBalancers && health.type === 'LoadBalancer') {
                loadBalancers = health.loadBalancers;
                loadBalancerSort = _(health.loadBalancers)
                .sortByAll(['name', 'state'])
                .map(function (lbh) {
                  return lbh.name + ':' + lbh.state;
                })
                .join(',');
              }
              if (scope.hasDiscovery && health.type === 'Discovery') {
                discoveryState = health.state.toLowerCase();
                discoveryStatus = $filter('robotToHuman')(health.status.toLowerCase());
              }
              if (scope.showProviderHealth) {
                providerStatus = health.state;
              }
            });

            var row = buildTableRowOpenTag(instance, activeClass);
            row += buildInstanceCheckboxCell(instance);
            row += buildInstanceIdCell(instance);
            row += buildLaunchTimeCell(instance);
            row += buildZoneCell(instance);
            if (scope.hasDiscovery) {
              row += buildDiscoveryCell(discoveryStatus);
            }
            if (scope.hasLoadBalancers) {
              row += buildLoadBalancersCell(loadBalancers);
            }
            if (scope.showProviderHealth) {
              row += buildProviderHealthCell(providerStatus);
            }
            row += '</tr>';

            return row;

          }).join('');

          if (elem.get(0).innerHTML !== newHtml) {
            if (tooltipEnabled) {
              $('[data-toggle="tooltip"]', elem).tooltip('destroy');
            }
            elem.get(0).innerHTML = newHtml;
            if (tooltipEnabled) {
              $('[data-toggle="tooltip"]', elem).tooltip({placement: 'left', container: 'body'});
            }
          }
        }

        scope.$watch('sortFilter.instanceSort.key', function(newVal, oldVal) {
          if (newVal && oldVal && newVal !== oldVal) {
            renderInstances();
          }
        });

        renderInstances();

        elem.click(function(event) {
          $timeout(function() {
            if (event.target) {
              let $target = $(event.target);
              if ($target.is(':checkbox')) {
                toggleSelection(event.target.getAttribute('data-instance-id'));
                event.preventDefault();
                return;
              }
              // anything handled by ui-sref or actual links should be ignored
              if (event.isDefaultPrevented() || (event.originalEvent && (event.originalEvent.defaultPrevented || event.originalEvent.target.href))) {
                return;
              }
              var $targetRow =  $(event.target).closest('tr');
              if (!$targetRow.length) {
                return;
              }
              if (activeInstance) {
                $('tr[data-instance-id="' + activeInstance.instanceId+'"]', elem).removeClass('active');
              }
              var targetRow = $targetRow.get(0);
              var params = {
                instanceId: targetRow.getAttribute('data-instance-id'),
                provider: targetRow.getAttribute('data-provider')
              };
              activeInstance = params;
              // also stolen from uiSref directive
              $state.go('.instanceDetails', params, {relative: base, inherit: true});
              $targetRow.addClass('active');
              event.preventDefault();
            }
          });
        });

        function clearActiveState() {
          if (activeInstance && !$state.includes('**.instanceDetails', activeInstance)) {
            $('tr[data-instance-id="' + activeInstance.instanceId+'"]', elem).removeClass('active');
            activeInstance = null;
          }
        }

        let renderIfMultiselectChanges = () => {
          if (!_.isEqual(renderedMultiselectInstances.sort(), instanceGroup.instanceIds.sort())) {
            renderInstances();
          }
        };

        scope.$on('$locationChangeSuccess', clearActiveState);
        let multiselectWatcher = ClusterFilterModel.multiselectInstancesStream.subscribe(renderIfMultiselectChanges);

        scope.$on('$destroy', function() {
          multiselectWatcher.dispose();
          if (tooltipEnabled) {
            $('[data-toggle="tooltip"]', elem).tooltip('destroy').removeData();
          }
          elem.unbind('click');
        });

        scope.$watch('instances', renderInstances);

      }
    };
});
